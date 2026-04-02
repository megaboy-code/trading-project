# ===============================================================
# STRATEGY_MA_CROSSOVER.PY - FULLY SELF-CONTAINED VERSION
# ===============================================================

import numpy as np
from typing import List, Dict, Optional
from datetime import datetime

class MACrossoverStrategy:
    """
    ✅ FULLY SELF-CONTAINED Moving Average Crossover Strategy
    - Tracks its own P&L, win rate, and trade history
    - Maintains position state
    - Calculates real performance metrics
    """
    
    def __init__(self, params: Dict):
        # Strategy parameters
        self.fast_period = params.get('fast', 10)
        self.slow_period = params.get('slow', 30)
        self.source = params.get('source', 'close')
        self.volume = params.get('volume', 0.01)
        
        # ✅ COMPLETE TRADE TRACKING
        self.position = None
        self.entry_price = 0.0
        self.entry_time = None
        
        # ✅ TRADE HISTORY
        self.trade_history: List[Dict] = []
        
        # ✅ REAL P&L TRACKING
        self.realized_pnl = 0.0
        self.unrealized_pnl = 0.0
        self.total_pnl = 0.0
        
        # ✅ WIN/LOSS STATISTICS
        self.winning_trades = 0
        self.losing_trades = 0
        self.total_trades = 0
        self.win_rate = 0.0
        
        # Signal tracking
        self.signal_count = 0
        self.last_signal = None
        self.last_action = None
        self.last_candle_time = None
        
        # Metrics
        self.created_at = datetime.now().isoformat()

    # ==================== INDICATOR HISTORY ====================

    def get_indicator_history(self, candles: List[Dict]) -> Dict:
        """
        Calculate full MA history for all candles.
        Called once when chart subscribes.
        Returns fast_ma and slow_ma arrays aligned with candle timestamps.
        """
        if not candles:
            return {}

        try:
            prices = self._extract_prices(candles)

            fast_series = self._calculate_sma_series(prices, self.fast_period)
            slow_series = self._calculate_sma_series(prices, self.slow_period)

            fast_values = []
            slow_values = []

            for i, candle in enumerate(candles):
                fast_val = (
                    fast_series[i]
                    if i < len(fast_series) and fast_series[i] is not None
                    else None
                )
                slow_val = (
                    slow_series[i]
                    if i < len(slow_series) and slow_series[i] is not None
                    else None
                )

                if fast_val is not None:
                    fast_values.append({
                        'time': candle['time'],
                        'value': round(fast_val, 5)
                    })

                if slow_val is not None:
                    slow_values.append({
                        'time': candle['time'],
                        'value': round(slow_val, 5)
                    })

            print(f"📊 Indicator history: {len(fast_values)} fast, {len(slow_values)} slow points")

            return {
                'fast_period': self.fast_period,
                'slow_period': self.slow_period,
                'fast_ma': fast_values,
                'slow_ma': slow_values
            }

        except Exception as e:
            print(f"❌ Error calculating indicator history: {e}")
            return {}

    def get_latest_indicators(self, candles: List[Dict]) -> Dict:
        """
        Calculate latest MA values from candles.
        Called on every candle update.
        Returns latest fast_ma and slow_ma single values.
        """
        if not candles or len(candles) < self.slow_period:
            return {}

        try:
            prices = self._extract_prices(candles)

            fast_ma = self._calculate_sma(prices, self.fast_period)
            slow_ma = self._calculate_sma(prices, self.slow_period)

            if not fast_ma or not slow_ma:
                return {}

            latest_candle = candles[-1]

            return {
                'fast_period': self.fast_period,
                'slow_period': self.slow_period,
                'fast_ma': {
                    'time': latest_candle['time'],
                    'value': round(fast_ma[-1], 5)
                },
                'slow_ma': {
                    'time': latest_candle['time'],
                    'value': round(slow_ma[-1], 5)
                }
            }

        except Exception as e:
            print(f"❌ Error calculating latest indicators: {e}")
            return {}

    # ==================== LIVE TRADING WITH P&L TRACKING ====================
    
    def calculate_signal(self, candles: List[Dict]) -> Optional[Dict]:
        """
        ✅ Calculate signal AND update P&L for open position
        """
        if len(candles) < self.slow_period + 5:
            return None
        
        latest_candle = candles[-1]
        current_price = latest_candle['close']
        
        # ✅ UPDATE UNREALIZED P&L
        if self.position:
            self.unrealized_pnl = self._calculate_unrealized_pnl(current_price)
            self.total_pnl = self.realized_pnl + self.unrealized_pnl
        
        # Check if already processed
        if self.last_candle_time and latest_candle['time'] <= self.last_candle_time:
            return None
        
        # Calculate MAs
        prices = self._extract_prices(candles)
        fast_ma = self._calculate_sma(prices, self.fast_period)
        slow_ma = self._calculate_sma(prices, self.slow_period)
        
        if len(fast_ma) < 2 or len(slow_ma) < 2:
            return None
        
        current_fast = fast_ma[-1]
        current_slow = slow_ma[-1]
        prev_fast = fast_ma[-2]
        prev_slow = slow_ma[-2]
        
        # ✅ DETECT CROSSOVER
        signal = None
        message = ""
        
        if prev_fast < prev_slow and current_fast > current_slow:
            signal = 'BUY'
            message = f"MA Crossover BUY: Fast({self.fast_period}) crossed above Slow({self.slow_period})"
        
        elif prev_fast > prev_slow and current_fast < current_slow:
            signal = 'SELL'
            message = f"MA Crossover SELL: Fast({self.fast_period}) crossed below Slow({self.slow_period})"
        
        # ✅ PROCESS SIGNAL
        if signal and signal != self.last_action:
            if self.position == 'long' and signal == 'SELL':
                self._close_position(current_price, latest_candle['time'], 'SELL_SIGNAL')
            elif self.position == 'short' and signal == 'BUY':
                self._close_position(current_price, latest_candle['time'], 'BUY_SIGNAL')
            
            self._open_position(signal, current_price, latest_candle['time'])
            
            self.last_action = signal
            self.signal_count += 1
            self.last_candle_time = latest_candle['time']
            
            crossover_strength = abs(current_fast - current_slow) / current_price
            confidence = min(0.9, max(0.6, crossover_strength * 100))
            
            signal_data = {
                'action': signal,
                'confidence': round(confidence, 2),
                'message': message,
                'fast_ma': round(current_fast, 5),
                'slow_ma': round(current_slow, 5),
                'price': current_price,
                'timestamp': datetime.now().isoformat(),
                'volume': self.volume,
                'stats': self.get_stats()
            }
            
            self.last_signal = signal_data
            
            print(f"✅ {signal}: Fast={current_fast:.5f}, Slow={current_slow:.5f}, P&L=${self.total_pnl:.2f}")
            
            return signal_data
        
        return None

    # ==================== POSITION MANAGEMENT ====================
    
    def _open_position(self, position_type: str, price: float, time: str):
        """Open a new position"""
        self.position = 'long' if position_type == 'BUY' else 'short'
        self.entry_price = price
        self.entry_time = time
        print(f"📈 Opened {self.position} @ {price}")
    
    def _close_position(self, exit_price: float, exit_time: str, reason: str):
        """Close position and calculate real P&L"""
        if not self.position:
            return
        
        if self.position == 'long':
            pnl = (exit_price - self.entry_price) * self.volume * 100000
        else:
            pnl = (self.entry_price - exit_price) * self.volume * 100000
        
        self.realized_pnl += pnl
        self.total_trades += 1
        
        if pnl > 0:
            self.winning_trades += 1
        else:
            self.losing_trades += 1
        
        self.win_rate = (
            (self.winning_trades / self.total_trades * 100)
            if self.total_trades > 0 else 0
        )
        
        trade_record = {
            'position': self.position,
            'entry_price': self.entry_price,
            'exit_price': exit_price,
            'entry_time': self.entry_time,
            'exit_time': exit_time,
            'pnl': round(pnl, 2),
            'volume': self.volume,
            'reason': reason
        }
        
        self.trade_history.append(trade_record)
        
        print(f"📉 Closed {self.position} @ {exit_price}, P&L: ${pnl:.2f}, Win Rate: {self.win_rate:.1f}%")
        
        self.position = None
        self.entry_price = 0.0
        self.entry_time = None
        self.unrealized_pnl = 0.0
        self.total_pnl = self.realized_pnl
    
    def _calculate_unrealized_pnl(self, current_price: float) -> float:
        """Calculate unrealized P&L for open position"""
        if not self.position:
            return 0.0
        
        if self.position == 'long':
            return (current_price - self.entry_price) * self.volume * 100000
        else:
            return (self.entry_price - current_price) * self.volume * 100000

    # ==================== STATISTICS ====================
    
    def get_stats(self) -> Dict:
        """Return complete strategy statistics"""
        return {
            'signal_count': self.signal_count,
            'last_signal': self.last_signal,
            'last_action': self.last_action,
            'position': self.position,
            'total_signals': self.signal_count,
            'created_at': self.created_at,
            'last_candle_time': self.last_candle_time,
            'total_trades': self.total_trades,
            'winning_trades': self.winning_trades,
            'losing_trades': self.losing_trades,
            'win_rate': round(self.win_rate, 2),
            'realized_pnl': round(self.realized_pnl, 2),
            'unrealized_pnl': round(self.unrealized_pnl, 2),
            'total_pnl': round(self.total_pnl, 2),
            'entry_price': self.entry_price if self.position else None,
            'trade_history': self.trade_history[-10:]
        }
    
    def get_parameters(self) -> Dict:
        """Get current strategy parameters"""
        return {
            'fast': self.fast_period,
            'slow': self.slow_period,
            'source': self.source,
            'volume': self.volume
        }
    
    def update_parameters(self, new_params: Dict):
        """Update strategy parameters"""
        if 'fast' in new_params:
            self.fast_period = new_params['fast']
        if 'slow' in new_params:
            self.slow_period = new_params['slow']
        if 'source' in new_params:
            self.source = new_params['source']
        if 'volume' in new_params:
            self.volume = new_params['volume']
        
        print(f"⚙️ Parameters updated: {self.get_parameters()}")

    # ==================== BACKTESTING ====================
    
    def backtest(self, candles: List[Dict], initial_balance: float = 10000.0) -> Dict:
        """Backtest with real trade tracking"""
        if len(candles) < self.slow_period + 20:
            return self._empty_backtest_result()
        
        test_strategy = MACrossoverStrategy({
            'fast': self.fast_period,
            'slow': self.slow_period,
            'source': self.source,
            'volume': self.volume
        })
        
        prices = test_strategy._extract_prices(candles)
        fast_ma_series = test_strategy._calculate_sma_series(prices, self.fast_period)
        slow_ma_series = test_strategy._calculate_sma_series(prices, self.slow_period)
        
        for i in range(self.slow_period, len(candles)):
            if i < len(fast_ma_series) and i < len(slow_ma_series):
                current_fast = fast_ma_series[i]
                current_slow = slow_ma_series[i]
                prev_fast = fast_ma_series[i-1] if i > 0 else current_fast
                prev_slow = slow_ma_series[i-1] if i > 0 else current_slow

                if current_fast is None or current_slow is None:
                    continue
                if prev_fast is None or prev_slow is None:
                    continue

                candle = candles[i]
                current_price = candle['close']
                
                if test_strategy.position:
                    test_strategy.unrealized_pnl = test_strategy._calculate_unrealized_pnl(current_price)
                    test_strategy.total_pnl = test_strategy.realized_pnl + test_strategy.unrealized_pnl
                
                signal = None
                
                if prev_fast < prev_slow and current_fast > current_slow:
                    signal = 'BUY'
                elif prev_fast > prev_slow and current_fast < current_slow:
                    signal = 'SELL'
                
                if signal:
                    if test_strategy.position == 'long' and signal == 'SELL':
                        test_strategy._close_position(current_price, candle['time'], 'SELL_SIGNAL')
                    elif test_strategy.position == 'short' and signal == 'BUY':
                        test_strategy._close_position(current_price, candle['time'], 'BUY_SIGNAL')
                    
                    test_strategy._open_position(signal, current_price, candle['time'])
        
        if test_strategy.position:
            final_price = candles[-1]['close']
            test_strategy._close_position(final_price, candles[-1]['time'], 'BACKTEST_END')
        
        return self._calculate_backtest_metrics(test_strategy)
    
    def _calculate_backtest_metrics(self, test_strategy) -> Dict:
        """Calculate backtest metrics from completed strategy run"""
        if test_strategy.total_trades == 0:
            return self._empty_backtest_result()
        
        avg_win = (
            sum(t['pnl'] for t in test_strategy.trade_history if t['pnl'] > 0) /
            test_strategy.winning_trades
            if test_strategy.winning_trades > 0 else 0
        )
        avg_loss = (
            sum(abs(t['pnl']) for t in test_strategy.trade_history if t['pnl'] < 0) /
            test_strategy.losing_trades
            if test_strategy.losing_trades > 0 else 0
        )
        
        gross_profit = sum(t['pnl'] for t in test_strategy.trade_history if t['pnl'] > 0)
        gross_loss = abs(sum(t['pnl'] for t in test_strategy.trade_history if t['pnl'] < 0))
        profit_factor = gross_profit / gross_loss if gross_loss > 0 else 0
        
        equity_curve = [0]
        for trade in test_strategy.trade_history:
            equity_curve.append(equity_curve[-1] + trade['pnl'])
        
        equity_array = np.array(equity_curve)
        peak = np.maximum.accumulate(equity_array)
        drawdown = (peak - equity_array) / (peak + 1e-10) * 100
        max_drawdown = np.max(drawdown) if len(drawdown) > 0 else 0
        
        returns = np.diff(equity_array) if len(equity_array) > 1 else np.array([0])
        sharpe = (
            np.mean(returns) / (np.std(returns) + 1e-10) * np.sqrt(252)
            if len(returns) > 0 else 0
        )
        
        return {
            'success': True,
            'summary': {
                'total_trades': test_strategy.total_trades,
                'winning_trades': test_strategy.winning_trades,
                'losing_trades': test_strategy.losing_trades,
                'win_rate': round(test_strategy.win_rate, 2),
                'total_pnl': round(test_strategy.realized_pnl, 2),
                'total_return_pct': round((test_strategy.realized_pnl / 10000) * 100, 2),
                'final_balance': round(10000 + test_strategy.realized_pnl, 2),
                'avg_win': round(avg_win, 2),
                'avg_loss': round(avg_loss, 2),
                'profit_factor': round(profit_factor, 2),
                'max_drawdown_pct': round(max_drawdown, 2),
                'sharpe_ratio': round(sharpe, 2)
            },
            'trades': test_strategy.trade_history,
            'equity_curve': [round(e, 2) for e in equity_curve],
            'parameters': self.get_parameters(),
            'timestamp': datetime.now().isoformat()
        }

    # ==================== UTILITY METHODS ====================
    
    def _extract_prices(self, candles: List[Dict]) -> List[float]:
        """Extract prices based on source parameter"""
        prices = []
        for candle in candles:
            if self.source == 'close':
                prices.append(candle['close'])
            elif self.source == 'open':
                prices.append(candle['open'])
            elif self.source == 'hl2':
                prices.append((candle['high'] + candle['low']) / 2)
            elif self.source == 'hlc3':
                prices.append((candle['high'] + candle['low'] + candle['close']) / 3)
            else:
                prices.append(candle['close'])
        return prices
    
    def _calculate_sma(self, prices: List[float], period: int) -> List[float]:
        """Calculate Simple Moving Average"""
        if len(prices) < period:
            return []
        
        sma_values = []
        for i in range(period - 1, len(prices)):
            sma = sum(prices[i-period+1:i+1]) / period
            sma_values.append(sma)
        
        return sma_values
    
    def _calculate_sma_series(self, prices: List[float], period: int) -> List[float]:
        """Calculate SMA for entire series aligned with candle index"""
        sma_series = [None] * (period - 1)
        
        for i in range(period - 1, len(prices)):
            sma = sum(prices[i-period+1:i+1]) / period
            sma_series.append(sma)
        
        return sma_series

    def _empty_backtest_result(self) -> Dict:
        """Return empty backtest result"""
        return {
            'success': False,
            'summary': {
                'total_trades': 0,
                'winning_trades': 0,
                'losing_trades': 0,
                'win_rate': 0,
                'total_pnl': 0,
                'total_return_pct': 0,
                'final_balance': 0,
                'avg_win': 0,
                'avg_loss': 0,
                'profit_factor': 0,
                'max_drawdown_pct': 0,
                'sharpe_ratio': 0
            },
            'trades': [],
            'equity_curve': [],
            'parameters': self.get_parameters(),
            'message': 'Insufficient data for backtest',
            'timestamp': datetime.now().isoformat()
        }


# ==================== STRATEGY REGISTRATION ====================

STRATEGY_INFO = {
    'name': 'MA Crossover',
    'description': 'Dual moving average crossover with full P&L tracking',
    'category': 'trend',
    'parameters': {
        'fast': {'type': 'int', 'min': 2, 'max': 50, 'default': 10, 'description': 'Fast MA period'},
        'slow': {'type': 'int', 'min': 10, 'max': 100, 'default': 30, 'description': 'Slow MA period'},
        'source': {'type': 'select', 'options': ['close', 'open', 'hl2', 'hlc3'], 'default': 'close', 'description': 'Price source'},
        'volume': {'type': 'float', 'min': 0.01, 'max': 100, 'default': 0.01, 'description': 'Trade volume (lots)'}
    },
    'class': MACrossoverStrategy
}