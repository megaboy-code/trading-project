# ===============================================================
# STRATEGY_MANAGER.PY - Strategy Lifecycle & Signal Generation
# ===============================================================

import json
import asyncio
import uuid
from datetime import datetime
from typing import Dict, List, Optional, Callable
from collections import defaultdict, deque

import config
from strategy_ma_crossover import MACrossoverStrategy


class StrategyManager:

    def __init__(self, trade_executor: Optional[Callable] = None):
        self.active_strategies: Dict[str, Dict] = {}

        self.strategy_buffers = defaultdict(
            lambda: deque(maxlen=config.CANDLE_FETCH_COUNT)
        )

        self.auto_trading_enabled = False
        self.trade_executor = trade_executor
        self.send_to_frontend: Optional[Callable] = None
        self.data_fetcher: Optional[Callable] = None

        self.strategy_classes = {
            'ma_crossover': MACrossoverStrategy,
        }

        self.strategy_tasks: Dict[str, asyncio.Task] = {}

        self.strategy_update_intervals = {
            'M1':  60,
            'M5':  300,
            'M15': 900,
            'H1':  3600,
            'H4':  14400,
            'D1':  86400
        }

        print(f"✅ Strategy Manager initialized (buffer size: {config.CANDLE_FETCH_COUNT})")

    # ==================== WEBSOCKET COMMAND PARSER ====================

    async def handle_raw_command(self, raw_command: str) -> Dict:
        """Parse and handle raw WebSocket command"""
        print(f"🔍 RAW COMMAND: '{raw_command}'")

        try:
            if raw_command == "GET_ACTIVE_STRATEGIES":
                return await self._get_active_strategies()

            elif raw_command.startswith("DEPLOY_STRATEGY_"):
                return await self._parse_deploy_command(raw_command)

            elif raw_command.startswith("REMOVE_STRATEGY_"):
                return await self._parse_remove_command(raw_command)

            elif raw_command.startswith("UPDATE_STRATEGY_"):
                return await self._parse_update_command(raw_command)

            elif raw_command.startswith("BACKTEST_STRATEGY_"):
                return await self._parse_backtest_command(raw_command)

            else:
                return {
                    'success': False,
                    'error':   f'Unknown strategy command: {raw_command}',
                    'command': raw_command
                }

        except Exception as e:
            print(f"❌ Command parsing error: {str(e)}")
            return {
                'success': False,
                'error':   f'Command parsing error: {str(e)}',
                'command': raw_command
            }

    async def _parse_deploy_command(self, command: str) -> Dict:
        """Parse: DEPLOY_STRATEGY_ma_crossover_EURUSD_H1_{"fast":10,"slow":30}"""
        try:
            content = command.replace("DEPLOY_STRATEGY_", "").strip()

            last_underscore = content.rfind('_')
            if last_underscore == -1:
                return {'success': False, 'error': 'Invalid command format - no JSON params'}

            strategy_part = content[:last_underscore]
            json_part     = content[last_underscore + 1:]

            strategy_type = None
            symbol        = None
            timeframe     = None

            for stype in self.strategy_classes.keys():
                if strategy_part.startswith(stype + '_'):
                    strategy_type = stype
                    rest = strategy_part[len(stype) + 1:]

                    rest_parts = rest.split('_', 1)
                    if len(rest_parts) == 2:
                        symbol    = rest_parts[0]
                        timeframe = rest_parts[1]
                    break

            if not all([strategy_type, symbol, timeframe]):
                return {'success': False, 'error': 'Missing strategy type, symbol, or timeframe'}

            try:
                params = json.loads(json_part)
                if not isinstance(params, dict):
                    params = {}
            except json.JSONDecodeError as e:
                return {'success': False, 'error': f'Invalid JSON parameters: {str(e)}'}

            return await self.deploy_strategy({
                'strategy_type': strategy_type,
                'symbol':        symbol,
                'timeframe':     timeframe,
                'params':        params
            })

        except Exception as e:
            return {'success': False, 'error': f'Deploy parse error: {str(e)}'}

    async def _parse_remove_command(self, command: str) -> Dict:
        """Parse: REMOVE_STRATEGY_abc123"""
        try:
            strategy_id = command.replace("REMOVE_STRATEGY_", "").strip()

            if not strategy_id:
                return {'success': False, 'error': 'Missing strategy_id'}

            return await self.remove_strategy({'strategy_id': strategy_id})

        except Exception as e:
            return {'success': False, 'error': f'Remove parse error: {str(e)}'}

    async def _parse_update_command(self, command: str) -> Dict:
        """Parse: UPDATE_STRATEGY_abc123_{"fast":8,"slow":25}"""
        try:
            content = command.replace("UPDATE_STRATEGY_", "").strip()

            last_underscore = content.rfind('_')
            if last_underscore == -1:
                return {'success': False, 'error': 'Invalid update format'}

            strategy_id = content[:last_underscore]
            json_part   = content[last_underscore + 1:]

            try:
                updates = json.loads(json_part)
                if not isinstance(updates, dict):
                    updates = {}
            except json.JSONDecodeError:
                updates = {}

            return await self.update_strategy({
                'strategy_id': strategy_id,
                'updates':     updates
            })

        except Exception as e:
            return {'success': False, 'error': f'Update parse error: {str(e)}'}

    async def _parse_backtest_command(self, command: str) -> Dict:
        """Parse: BACKTEST_STRATEGY_ma_crossover_EURUSD_H1_30_{"fast":10,"slow":30}"""
        try:
            content = command.replace("BACKTEST_STRATEGY_", "").strip()

            last_underscore = content.rfind('_')
            if last_underscore == -1:
                return {'success': False, 'error': 'Invalid backtest format'}

            strategy_part = content[:last_underscore]
            json_part     = content[last_underscore + 1:]

            strategy_type = None
            symbol        = None
            timeframe     = None
            days          = 30

            for stype in self.strategy_classes.keys():
                if strategy_part.startswith(stype + '_'):
                    strategy_type = stype
                    rest  = strategy_part[len(stype) + 1:]
                    parts = rest.split('_')

                    if len(parts) >= 2:
                        symbol    = parts[0]
                        timeframe = parts[1]
                        if len(parts) >= 3:
                            try:
                                days = int(parts[2])
                            except ValueError:
                                days = 30
                    break

            if not strategy_type:
                return {'success': False, 'error': 'Could not identify strategy type'}

            try:
                params = json.loads(json_part)
                if not isinstance(params, dict):
                    params = {}
            except json.JSONDecodeError:
                params = {}

            return await self._execute_backtest(
                strategy_type, symbol, timeframe, days, params
            )

        except Exception as e:
            return {'success': False, 'error': f'Backtest parse error: {str(e)}'}

    async def _execute_backtest(self, strategy_type: str, symbol: str, timeframe: str,
                                days: int, params: Dict) -> Dict:
        """Execute backtest and return results"""
        try:
            print(f"📊 Running backtest: {strategy_type} on {symbol} {timeframe} for {days} days")

            if not self.data_fetcher:
                return {'success': False, 'error': 'Data fetcher not configured'}

            candles_per_day = {
                'M1': 1440, 'M5': 288, 'M15': 96,
                'H1': 24,   'H4': 6,   'D1': 1
            }
            required_candles = candles_per_day.get(timeframe, 24) * days
            required_candles = min(required_candles, config.CANDLE_FETCH_COUNT)

            candles = await self.data_fetcher(symbol, timeframe, required_candles)

            if not candles or len(candles) < 50:
                return {
                    'success': False,
                    'error':   f'Insufficient data: only {len(candles) if candles else 0} candles available'
                }

            strategy_class = self.strategy_classes.get(strategy_type)
            if not strategy_class:
                return {'success': False, 'error': f'Unknown strategy type: {strategy_type}'}

            strategy_instance = strategy_class(params)
            result = strategy_instance.backtest(candles)

            if not result.get('success'):
                return result

            result['type']         = 'backtest_results'
            result['strategy']     = strategy_type
            result['symbol']       = symbol
            result['timeframe']    = timeframe
            result['days']         = days
            result['candles_used'] = len(candles)

            print(f"✅ Backtest complete: {result['summary']['total_trades']} trades, "
                  f"Win Rate: {result['summary']['win_rate']}%, "
                  f"P&L: ${result['summary']['total_pnl']:.2f}")

            return {'success': True, 'data': result}

        except Exception as e:
            print(f"❌ Backtest execution error: {str(e)}")
            import traceback
            traceback.print_exc()
            return {'success': False, 'error': f'Backtest execution error: {str(e)}'}

    async def _get_active_strategies(self) -> Dict:
        """Get all active strategies with their stats"""
        strategies_list = []

        for strategy_id, config_item in self.active_strategies.items():
            instance       = config_item['strategy_instance']
            strategy_stats = instance.get_stats()

            strategies_list.append({
                'strategy_id':   strategy_id,
                'strategy_type': config_item['strategy_type'],
                'symbol':        config_item['symbol'],
                'timeframe':     config_item['timeframe'],
                'params':        instance.get_parameters(),
                'active':        config_item['active'],
                'created_at':    config_item['created_at'],
                'signal_count':  strategy_stats['signal_count'],
                'last_signal':   strategy_stats['last_signal'],
                'position':      strategy_stats['position'],
                'trade_count':   strategy_stats['total_trades'],
                'pnl':           strategy_stats['total_pnl'],
                'win_rate':      strategy_stats['win_rate']
            })

        return {
            'success':      True,
            'strategies':   strategies_list,
            'count':        len(strategies_list),
            'auto_trading': self.auto_trading_enabled
        }

    # ==================== STRATEGY MANAGEMENT ====================

    async def deploy_strategy(self, data: Dict) -> Dict:
        """Deploy a new strategy and immediately push indicator lines to frontend"""
        try:
            strategy_type = data.get('strategy_type')
            symbol        = data.get('symbol')
            timeframe     = data.get('timeframe')
            params        = data.get('params', {})

            if not all([strategy_type, symbol, timeframe]):
                return {'success': False, 'error': 'Missing required fields'}

            if strategy_type not in self.strategy_classes:
                return {'success': False, 'error': f'Unknown strategy type: {strategy_type}'}

            strategy_id = f"{strategy_type}_{symbol}_{timeframe}_{uuid.uuid4().hex[:8]}"

            if strategy_id in self.active_strategies:
                return {'success': False, 'error': f'Strategy {strategy_id} already exists'}

            strategy_class    = self.strategy_classes[strategy_type]
            strategy_instance = strategy_class(params)

            if not self.data_fetcher:
                return {'success': False, 'error': 'Data fetcher not configured'}

            initial_candles = await self.data_fetcher(
                symbol, timeframe, config.CANDLE_FETCH_COUNT
            )

            if not initial_candles or len(initial_candles) < 50:
                return {
                    'success': False,
                    'error':   f'Insufficient data for {symbol} {timeframe}'
                }

            buffer_key = (symbol.upper(), timeframe.upper())
            self.strategy_buffers[buffer_key].clear()
            for candle in initial_candles:
                self.strategy_buffers[buffer_key].append(candle)

            print(f"✅ Loaded {len(initial_candles)} candles for {strategy_id}")

            self.active_strategies[strategy_id] = {
                'strategy_id':       strategy_id,
                'strategy_type':     strategy_type,
                'symbol':            symbol,
                'timeframe':         timeframe,
                'strategy_instance': strategy_instance,
                'active':            True,
                'created_at':        datetime.now().isoformat(),
                'trade_count':       0
            }

            update_task = asyncio.create_task(
                self._strategy_update_loop(strategy_id)
            )
            self.strategy_tasks[strategy_id] = update_task

            print(f"✅ Strategy deployed: {strategy_id}")

            stats = strategy_instance.get_stats()

            # ✅ Step 1 — Send strategy config to frontend
            await self._send_to_frontend('strategy_deployed', {
                'strategy_id': strategy_id,
                'config': {
                    'strategy_id':   strategy_id,
                    'strategy_type': strategy_type,
                    'symbol':        symbol,
                    'timeframe':     timeframe,
                    'params':        params,
                    'active':        True,
                    'created_at':    self.active_strategies[strategy_id]['created_at'],
                    'signal_count':  stats['signal_count'],
                    'trade_count':   stats['total_trades'],
                    'pnl':           stats['total_pnl'],
                    'win_rate':      stats['win_rate'],
                    'last_signal':   None
                }
            })

            # ✅ Step 2 — Immediately send indicator lines to frontend
            try:
                candles = list(self.strategy_buffers[buffer_key])
                history = strategy_instance.get_indicator_history(candles)

                if history:
                    await self._send_to_frontend('strategy_initial', {
                        'indicators': {
                            strategy_id: {
                                'strategy_type': strategy_type,
                                'symbol':        symbol,
                                'timeframe':     timeframe,
                                **history
                            }
                        }
                    })
                    print(f"📊 Sent initial indicator lines for {strategy_id}")
                else:
                    print(f"⚠️ No indicator history returned for {strategy_id}")

            except Exception as e:
                print(f"❌ Failed to send initial indicator lines for {strategy_id}: {e}")

            return {
                'success':     True,
                'strategy_id': strategy_id,
                'message':     f'Strategy {strategy_type} deployed on {symbol} {timeframe}',
                'config': {
                    'strategy_id':   strategy_id,
                    'strategy_type': strategy_type,
                    'symbol':        symbol,
                    'timeframe':     timeframe,
                    'params':        params
                }
            }

        except Exception as e:
            print(f"❌ Deployment error: {str(e)}")
            return {'success': False, 'error': f'Deployment error: {str(e)}'}

    async def remove_strategy(self, data: Dict) -> Dict:
        """Remove a strategy and stop its update task"""
        try:
            strategy_id = data.get('strategy_id')

            if not strategy_id:
                return {'success': False, 'error': 'Missing strategy_id'}

            if strategy_id not in self.active_strategies:
                return {'success': False, 'error': f'Strategy {strategy_id} not found'}

            if strategy_id in self.strategy_tasks:
                self.strategy_tasks[strategy_id].cancel()
                try:
                    await self.strategy_tasks[strategy_id]
                except asyncio.CancelledError:
                    pass
                del self.strategy_tasks[strategy_id]

            removed_config = self.active_strategies.pop(strategy_id)

            print(f"🗑️ Strategy removed: {strategy_id}")

            await self._send_to_frontend('strategy_removed', {
                'strategy_id': strategy_id,
                'config': {
                    'strategy_id':   strategy_id,
                    'strategy_type': removed_config['strategy_type']
                }
            })

            return {
                'success':     True,
                'strategy_id': strategy_id,
                'message':     'Strategy removed'
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    async def update_strategy(self, data: Dict) -> Dict:
        """Update strategy parameters"""
        try:
            strategy_id = data.get('strategy_id')
            updates     = data.get('updates', {})

            if not strategy_id:
                return {'success': False, 'error': 'Missing strategy_id'}

            if strategy_id not in self.active_strategies:
                return {'success': False, 'error': f'Strategy {strategy_id} not found'}

            config_item = self.active_strategies[strategy_id]

            if 'params' in updates:
                instance = config_item['strategy_instance']
                instance.update_parameters(updates['params'])
                print(f"⚙️ Updated parameters for {strategy_id}: {updates['params']}")

            if 'active' in updates:
                config_item['active'] = updates['active']

            instance = config_item['strategy_instance']

            await self._send_to_frontend('strategy_updated', {
                'strategy_id': strategy_id,
                'config': {
                    'strategy_id': strategy_id,
                    'params':      instance.get_parameters(),
                    'active':      config_item['active']
                }
            })

            return {
                'success':     True,
                'strategy_id': strategy_id,
                'message':     'Strategy updated'
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ==================== INDEPENDENT STRATEGY UPDATE LOOP ====================

    async def _strategy_update_loop(self, strategy_id: str):
        """Independent update loop for each strategy"""
        try:
            config_item = self.active_strategies.get(strategy_id)
            if not config_item:
                return

            symbol          = config_item['symbol']
            timeframe       = config_item['timeframe']
            update_interval = self.strategy_update_intervals.get(timeframe, 300)

            print(f"🔄 Started update loop for {strategy_id} (every {update_interval}s)")

            while strategy_id in self.active_strategies:
                try:
                    if config_item.get('active', True):
                        await self._fetch_and_process_strategy_data(strategy_id)

                    await asyncio.sleep(update_interval)

                except asyncio.CancelledError:
                    print(f"🛑 Update loop cancelled for {strategy_id}")
                    break
                except Exception as e:
                    print(f"❌ Error in update loop for {strategy_id}: {e}")
                    await asyncio.sleep(update_interval)

        except Exception as e:
            print(f"❌ Fatal error in update loop for {strategy_id}: {e}")

    async def _fetch_and_process_strategy_data(self, strategy_id: str):
        """
        Fetch latest data and process strategy using closed candles only.
        Pushes indicator update to frontend only when a new candle closes.
        """
        try:
            config_item = self.active_strategies.get(strategy_id)
            if not config_item:
                return

            symbol            = config_item['symbol']
            timeframe         = config_item['timeframe']
            strategy_instance = config_item['strategy_instance']

            if not self.data_fetcher:
                return

            latest_candles = await self.data_fetcher(symbol, timeframe, 5)

            if not latest_candles:
                return

            buffer_key    = (symbol.upper(), timeframe.upper())
            latest_closed = (
                latest_candles[-2] if len(latest_candles) >= 2
                else latest_candles[-1]
            )

            # ✅ Only process when a genuinely new closed candle arrives
            if len(self.strategy_buffers[buffer_key]) == 0 or \
               latest_closed['time'] > self.strategy_buffers[buffer_key][-1]['time']:

                self.strategy_buffers[buffer_key].append(latest_closed)
                full_buffer = list(self.strategy_buffers[buffer_key])

                # ✅ Push indicator update immediately on candle close
                latest = strategy_instance.get_latest_indicators(full_buffer)
                if latest:
                    await self._send_to_frontend('strategy_update', {
                        'symbol':    symbol,
                        'timeframe': timeframe,
                        'indicators': {
                            strategy_id: {
                                'strategy_type': config_item['strategy_type'],
                                'symbol':        symbol,
                                'timeframe':     timeframe,
                                **latest
                            }
                        }
                    })

                # ✅ Calculate signal
                signal = strategy_instance.calculate_signal(full_buffer)

                if signal:
                    print(f"📊 Signal: {signal['action']} for {strategy_id}")
                    await self._send_strategy_signal(
                        strategy_id, config_item, signal, latest_closed
                    )

                    if self.auto_trading_enabled and signal.get('action') in ['BUY', 'SELL']:
                        await self._execute_auto_trade(
                            strategy_id, config_item, signal, latest_closed
                        )

        except Exception as e:
            print(f"❌ Fetch and process error for {strategy_id}: {e}")

    # ==================== INDICATOR DATA FOR BROADCAST ====================

    def get_indicator_history(self, symbol: str, timeframe: str, candles: List[Dict]) -> Dict:
        """
        Called by broadcast_manager after sending initial chart data.
        Returns dict of strategy_id → full indicator history.
        """
        result = {}

        for strategy_id, config_item in self.active_strategies.items():
            if config_item['symbol'].upper() != symbol.upper():
                continue
            if config_item['timeframe'].upper() != timeframe.upper():
                continue

            try:
                instance = config_item['strategy_instance']
                history  = instance.get_indicator_history(candles)

                if history:
                    result[strategy_id] = {
                        'strategy_type': config_item['strategy_type'],
                        'symbol':        config_item['symbol'],
                        'timeframe':     config_item['timeframe'],
                        **history
                    }
                    print(f"📊 Indicator history ready for {strategy_id}")

            except Exception as e:
                print(f"❌ Indicator history error for {strategy_id}: {e}")

        return result

    # ==================== TRADE EXECUTION ====================

    async def _execute_auto_trade(self, strategy_id: str, config_item: Dict,
                                  signal: Dict, candle: Dict):
        """Execute trade when auto-trading is enabled"""
        if not self.trade_executor:
            print(f"⚠️ No trade executor for {strategy_id}")
            return

        try:
            action = signal['action']
            symbol = config_item['symbol']
            volume = signal.get('volume', 0.01)
            price  = signal.get('price', candle['close'])

            result = await self.trade_executor(
                symbol=symbol,
                trade_type=action,
                volume=volume,
                price=price
            )

            if result.get('success'):
                config_item['trade_count'] += 1
                print(f"✅ Auto-trade: {action} {symbol} via {strategy_id}")
            else:
                print(f"❌ Auto-trade failed: {result.get('error')}")

        except Exception as e:
            print(f"❌ Trade execution error: {e}")

    # ==================== FRONTEND COMMUNICATION ====================

    def set_send_callback(self, callback: Callable):
        """Set callback to send messages to frontend"""
        self.send_to_frontend = callback

    async def _send_to_frontend(self, msg_type: str, data: Dict):
        """Send message to frontend via callback"""
        if not self.send_to_frontend:
            return

        message = {
            'type':      msg_type,
            'data':      data,
            'timestamp': datetime.now().isoformat()
        }

        await self.send_to_frontend(message)

    async def _send_strategy_signal(self, strategy_id: str, config_item: Dict,
                                    signal: Dict, candle: Dict):
        """Send strategy signal with real stats to frontend"""
        instance = config_item['strategy_instance']
        stats    = instance.get_stats()

        await self._send_to_frontend('strategy_signal', {
            'strategy_id':   strategy_id,
            'strategy_type': config_item['strategy_type'],
            'symbol':        config_item['symbol'],
            'timeframe':     config_item['timeframe'],
            'signal':        signal,
            'candle_time':   candle.get('time'),
            'config': {
                'strategy_id':    strategy_id,
                'signal_count':   stats['signal_count'],
                'trade_count':    stats['total_trades'],
                'pnl':            stats['total_pnl'],
                'win_rate':       stats['win_rate'],
                'last_signal':    stats['last_signal'],
                'position':       stats['position'],
                'realized_pnl':   stats['realized_pnl'],
                'unrealized_pnl': stats['unrealized_pnl']
            }
        })

    # ==================== AUTO-TRADE CONTROL ====================

    def set_auto_trading(self, enabled: bool):
        """Set auto-trade master switch"""
        self.auto_trading_enabled = enabled
        print(f"🤖 Auto-trading: {'ENABLED' if enabled else 'DISABLED'}")

    # ==================== UTILITIES ====================

    def get_status(self) -> Dict:
        """Get manager status"""
        return {
            'active_strategies':    len(self.active_strategies),
            'auto_trading_enabled': self.auto_trading_enabled,
            'available_strategies': list(self.strategy_classes.keys()),
            'running_tasks':        len(self.strategy_tasks),
            'candle_buffer_size':   config.CANDLE_FETCH_COUNT,
            'last_update':          datetime.now().isoformat()
        }

    def get_candle_buffer(self, symbol: str, timeframe: str) -> List[Dict]:
        """Get stored candles for a symbol/timeframe"""
        return list(self.strategy_buffers.get(
            (symbol.upper(), timeframe.upper()), []
        ))


# ===============================================================
# GLOBAL INSTANCE
# ===============================================================

strategy_manager = StrategyManager()