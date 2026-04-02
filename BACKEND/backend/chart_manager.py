# ===============================================================
# CHART_MANAGER.PY - Chart State & Candle Storage (REFACTORED)
# ===============================================================

from datetime import datetime
from typing import Optional, Dict, List, Tuple
from connector import connector
import config


class ChartManager:
    """Manages chart state, candle storage, and data fetching"""
    
    def __init__(self):
        # ✅ SINGLE ATOMIC CHART STATE DICTIONARY
        self._chart_state = {
            'symbol': None,           # User symbol (e.g., "EURUSD")
            'timeframe': None,        # User timeframe (e.g., "M5")
            'detected': None,         # MT5 detected symbol
            'mt5_tf': None,           # MT5 timeframe code
            'initial_sent': False,    # Frontend confirmed ready
            'valid': False,           # Overall validity flag
            'pending_change': False   # Symbol change in progress
        }
        
        # ✅ CANDLE STORAGE - stores candles per symbol/timeframe
        self.candle_storage = {}  # Key: "SYMBOL_TIMEFRAME", Value: List[Dict]
        
        # ✅ RECONNECTION TRACKING
        self.last_valid_state = None  # Store last working chart state
        
        # Timeframe mapping
        self.tf_mapping = {
            'M1': 'M1', 'M5': 'M5', 'M15': 'M15',
            'H1': 'H1', 'H4': 'H4', 'D1': 'D1',
            '1': 'M1', '5': 'M5', '15': 'M15',
            '60': 'H1', '240': 'H4', '1D': 'D1'
        }
    
    # ==================== CHART STATE METHODS ====================
    
    def get_chart_state(self) -> Dict:
        """Get atomic copy of chart state"""
        return self._chart_state.copy()
    
    def set_chart_state(self, symbol: str, timeframe: str, detected: str = None):
        """Atomically set new chart state and save for reconnection"""
        mt5_tf = self.tf_mapping.get(timeframe.upper())
        
        self._chart_state.update({
            'symbol': symbol,
            'timeframe': timeframe,
            'detected': detected or self._chart_state['detected'],
            'mt5_tf': mt5_tf,
            'initial_sent': False,
            'valid': bool(detected and mt5_tf),
            'pending_change': True
        })
        
        # Save for reconnection if valid
        if self._chart_state['valid']:
            self.last_valid_state = self._chart_state.copy()
    
    def clear_chart_state(self):
        """Clear chart state atomically"""
        self._chart_state.update({
            'symbol': None,
            'timeframe': None,
            'detected': None,
            'mt5_tf': None,
            'initial_sent': False,
            'valid': False,
            'pending_change': False
        })
    
    def mark_chart_ready(self):
        """Mark chart as ready for updates after frontend confirms"""
        if self._chart_state['detected'] and self._chart_state['mt5_tf']:
            self._chart_state.update({
                'initial_sent': True,
                'pending_change': False,
                'valid': True
            })
            print(f"✅ Frontend ready for updates: {self._chart_state['symbol']}")
            return True
        return False
    
    def is_chart_valid(self, state: Dict = None) -> bool:
        """Check if chart state is valid for updates"""
        if state is None:
            state = self._chart_state
        
        return (
            state['valid'] and
            not state['pending_change'] and
            state['initial_sent'] and
            state['detected'] and 
            state['symbol'] and 
            state['timeframe'] and
            state['mt5_tf']
        )
    
    # ==================== CANDLE STORAGE METHODS ====================
    
    def get_storage_key(self, symbol: str, timeframe: str) -> str:
        """Get storage key for candles"""
        return f"{symbol}_{timeframe}"
    
    def store_candles(self, symbol: str, timeframe: str, candles: List[Dict]):
        """Store candles for symbol/timeframe"""
        key = self.get_storage_key(symbol, timeframe)
        self.candle_storage[key] = candles
    
    def get_stored_candles(self, symbol: str, timeframe: str) -> Optional[List[Dict]]:
        """Get stored candles for symbol/timeframe"""
        key = self.get_storage_key(symbol, timeframe)
        return self.candle_storage.get(key)
    
    def update_stored_candle(self, symbol: str, timeframe: str, new_candle: Dict):
        """Update last candle or append new one"""
        key = self.get_storage_key(symbol, timeframe)
        candles = self.candle_storage.get(key)
        
        if not candles:
            return
        
        if candles and candles[-1]['time'] == new_candle['time']:
            candles[-1] = new_candle
        else:
            candles.append(new_candle)
    
    def clear_candle_storage(self, symbol: str = None, timeframe: str = None):
        """Clear candle storage"""
        if symbol and timeframe:
            key = self.get_storage_key(symbol, timeframe)
            if key in self.candle_storage:
                del self.candle_storage[key]
        else:
            self.candle_storage.clear()
    
    # ==================== SYMBOL DETECTION ====================
    
    async def detect_symbol(self, symbol: str) -> Optional[str]:
        """Auto-detect MT5 symbol from user input"""
        return connector.auto_detect_symbol(symbol)
    
    # ==================== DATA FETCHING (NO WEBSOCKET SENDING) ====================
    
    async def fetch_initial_candles(self, symbol: str, timeframe: str) -> Tuple[bool, Optional[Dict], Optional[List[Dict]]]:
        """
        Fetch initial candles and setup chart state
        Returns: (success, error_dict, candles_list)
        """
        print(f"📥 Fetching initial candles: {symbol} {timeframe}")
        
        # Clear connector cache
        connector.clear_candle_cache(symbol, timeframe)
        
        # Detect symbol
        detected = await self.detect_symbol(symbol)
        if not detected:
            return False, {
                'type': 'error',
                'message': f'Symbol not found: {symbol}'
            }, None
        
        # Get MT5 timeframe
        mt5_tf = self.tf_mapping.get(timeframe.upper())
        if not mt5_tf:
            return False, {
                'type': 'error',
                'message': f'Invalid timeframe: {timeframe}'
            }, None
        
        # Set chart state
        self.set_chart_state(symbol, timeframe, detected)
        
        # Clear old candles
        self.clear_candle_storage(symbol, timeframe)
        
        # Fetch candles from connector
        candles, _ = connector.get_initial_candles(
            symbol, detected, mt5_tf, config.CANDLE_FETCH_COUNT
        )
        
        if not candles:
            self.clear_chart_state()
            return False, {
                'type': 'error',
                'message': f'No data available for {symbol}'
            }, None
        
        # Store candles
        self.store_candles(symbol, timeframe, candles)
        
        print(f"✅ Fetched {len(candles)} candles for {symbol} {timeframe}")
        
        return True, None, candles
    
    def fetch_candle_update(self) -> Optional[Dict]:
        """
        Fetch latest candle update for current chart
        Returns: latest_candle or None
        """
        state = self.get_chart_state()
        
        if not self.is_chart_valid(state):
            return None
        
        try:
            latest_candle = connector.get_candle_update(
                state['symbol'], 
                state['detected'], 
                state['mt5_tf']
            )
            
            if latest_candle:
                self.update_stored_candle(state['symbol'], state['timeframe'], latest_candle)
            
            return latest_candle
            
        except Exception as e:
            print(f"❌ Candle update fetch error: {e}")
            return None
    
    # ==================== RECONNECTION LOGIC ====================
    
    def save_state_for_reconnection(self):
        """Save current chart state for reconnection"""
        current_state = self.get_chart_state()
        if current_state['valid']:
            self.last_valid_state = current_state.copy()
            print(f"💾 Saved chart state for reconnection: {current_state['symbol']} {current_state['timeframe']}")
    
    def get_reconnection_state(self) -> Optional[Dict]:
        """Get saved state for reconnection"""
        return self.last_valid_state
    
    def clear_reconnection_state(self):
        """Clear saved reconnection state"""
        self.last_valid_state = None


# ===============================================================
# GLOBAL INSTANCE
# ===============================================================

chart_manager = ChartManager()