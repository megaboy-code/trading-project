# ===============================================================
# CONNECTOR.PY - MT5 Interface
# Three-thread architecture:
#   Thread 1 — Bar Pulse (100ms)
#              → on_tick        — raw tick push (bid/ask)
#              → on_bar_update  — raw M1 OHLC numpy (100ms)
#   Thread 2 — Trade + History (command queue)
#              → on_history_result — raw numpy history
#              → on_daily_open     — D1 open price
#   Thread 3 — Accountant (500ms)
#              → on_positions_update — raw positions + account
#              → on_connection_update — connection status
# Python does zero calculations — raw data only
# ===============================================================

import MetaTrader5 as mt5
import numpy as np
from datetime import datetime
from typing import Optional, Dict, List
import threading
import queue
import time
import config


# ===============================================================
# TIMEFRAME MAP - Single source of truth
# ===============================================================

TF_MAP = {
    'M1':  mt5.TIMEFRAME_M1,
    'M5':  mt5.TIMEFRAME_M5,
    'M15': mt5.TIMEFRAME_M15,
    'H1':  mt5.TIMEFRAME_H1,
    'H4':  mt5.TIMEFRAME_H4,
    'D1':  mt5.TIMEFRAME_D1,
}


class MT5Connector:

    def __init__(self):
        self.connected         = False
        self.available_symbols = []
        self.utc_offset        = 0
        self.symbol_cache      = {}

        # ── Per symbol state ──
        self.last_tick_msc  = {}
        self.last_bar_time  = {}

        # ── Thread 2 command queue ──
        self.trade_queue = queue.Queue()

        # ── Callbacks — set by C++ bridge ──
        self.on_tick              = None
        self.on_bar_update        = None
        self.on_history_result    = None
        self.on_positions_update  = None
        self.on_connection_update = None
        self.on_daily_open        = None
        self.on_symbol_detected   = None  # ← new: fires detected back to C++

        # ── Thread control ──
        self._running         = False
        self._thread1         = None
        self._thread2         = None
        self._thread3         = None

        # ── Active symbols for Thread 1 ──
        self._active_symbols      = []
        self._active_symbols_lock = threading.Lock()

        # ── Connection check timing ──
        self._last_connection_check = 0

    # ======================
    # CONNECTION MANAGEMENT
    # ======================

    def connect(self) -> bool:
        if not mt5.initialize():
            return False

        self.connected = True
        symbols = mt5.symbols_get()
        if symbols:
            self.available_symbols = [s.name for s in symbols]

        local = datetime.now()
        utc   = datetime.utcnow()
        self.utc_offset = (local - utc).total_seconds() / 3600

        return True

    def disconnect(self):
        self.stop_threads()
        if self.connected:
            mt5.shutdown()
            self.connected = False

    # ======================
    # BROKER STATUS CHECKING
    # ======================

    def check_mt5_connection(self) -> Dict:
        if not self.connected:
            return {
                'mt5_connected': False,
                'status_text':   'Connector not initialized',
                'timestamp':     datetime.utcnow().isoformat()
            }
        try:
            info = mt5.terminal_info()
            if info is None:
                return {
                    'mt5_connected': False,
                    'status_text':   'MT5 terminal not responding',
                    'timestamp':     datetime.utcnow().isoformat()
                }
            is_connected = info.connected
            return {
                'mt5_connected': is_connected,
                'status_text':   'Connected' if is_connected else 'Disconnected',
                'server':        info.server if hasattr(info, 'server') else 'Unknown',
                'timestamp':     datetime.utcnow().isoformat()
            }
        except Exception as e:
            return {
                'mt5_connected': False,
                'status_text':   f'MT5 connection error: {str(e)}',
                'timestamp':     datetime.utcnow().isoformat()
            }

    def _check_broker_connection(self, symbol: str) -> bool:
        if not self.connected:
            return False
        try:
            info = mt5.terminal_info()
            if info is None or not info.connected:
                return False
            tick = mt5.symbol_info_tick(symbol)
            return tick is not None
        except Exception:
            return False

    def _check_broker_connection_terminal(self) -> bool:
        if not self.connected:
            return False
        try:
            info = mt5.terminal_info()
            return info is not None and info.connected
        except Exception:
            return False

    # ======================
    # AUTO SYMBOL DETECTION
    # ======================

    def auto_detect_symbol(self, base_symbol: str) -> Optional[str]:
        if not self.connected:
            return None

        if base_symbol in self.symbol_cache:
            return self.symbol_cache[base_symbol]

        base = base_symbol.upper().replace('/', '')

        if base in self.available_symbols:
            mt5.symbol_select(base, True)
            self.symbol_cache[base_symbol] = base
            return base

        for symbol in self.available_symbols:
            if base in symbol:
                mt5.symbol_select(symbol, True)
                self.symbol_cache[base_symbol] = symbol
                return symbol

        common_modifiers = ['M', 'C', 'PRO', 'MICRO', 'MINI', 'CFD', '_', '.', ' ']
        for symbol in self.available_symbols:
            clean_symbol = symbol
            for mod in common_modifiers:
                clean_symbol = clean_symbol.replace(mod, '')
            if base == clean_symbol:
                mt5.symbol_select(symbol, True)
                self.symbol_cache[base_symbol] = symbol
                return symbol

        for symbol in self.available_symbols:
            if len(base) > 3 and base in symbol[:len(base) + 2]:
                mt5.symbol_select(symbol, True)
                self.symbol_cache[base_symbol] = symbol
                return symbol

        return None

    def get_cached_symbol(self, base_symbol: str) -> Optional[str]:
        if base_symbol in self.symbol_cache:
            return self.symbol_cache[base_symbol]
        return self.auto_detect_symbol(base_symbol)

    def clear_symbol_cache(self, symbol: str = None):
        if symbol:
            self.symbol_cache.pop(symbol, None)
        else:
            self.symbol_cache.clear()

    # ======================
    # ACTIVE SYMBOLS
    # ======================

    def set_active_symbols(self, detected_symbols: List[str]):
        with self._active_symbols_lock:
            self._active_symbols = detected_symbols
            for sym in detected_symbols:
                if sym not in self.last_tick_msc:
                    self.last_tick_msc[sym] = 0
                if sym not in self.last_bar_time:
                    self.last_bar_time[sym] = 0

    def add_active_symbol(self, detected_symbol: str):
        with self._active_symbols_lock:
            if detected_symbol not in self._active_symbols:
                self._active_symbols.append(detected_symbol)
                self.last_tick_msc[detected_symbol] = 0
                self.last_bar_time[detected_symbol] = 0

    def remove_active_symbol(self, detected_symbol: str):
        with self._active_symbols_lock:
            if detected_symbol in self._active_symbols:
                self._active_symbols.remove(detected_symbol)
                self.last_tick_msc.pop(detected_symbol, None)
                self.last_bar_time.pop(detected_symbol, None)

    # ===============================================================
    # THREAD 1 — BAR PULSE
    # ===============================================================

    def _tick_loop(self):
        while self._running:
            start = time.perf_counter()

            with self._active_symbols_lock:
                symbols = list(self._active_symbols)

            for symbol in symbols:
                try:
                    # ── Job 1 — raw tick push ──
                    tick = mt5.symbol_info_tick(symbol)
                    if tick is not None:
                        last_msc = self.last_tick_msc.get(symbol, 0)
                        if tick.time_msc > last_msc:
                            self.last_tick_msc[symbol] = tick.time_msc
                            if self.on_tick:
                                self.on_tick(symbol, tick)

                    # ── Job 2 — raw M1 numpy push ──
                    rates = mt5.copy_rates_from_pos(
                        symbol, mt5.TIMEFRAME_M1, 0, 1
                    )
                    if rates is None or len(rates) == 0:
                        continue

                    if self.on_bar_update:
                        self.on_bar_update(symbol, rates)

                    # ── Seed last bar time ──
                    current_bar_time = int(rates[0]['time'])
                    if self.last_bar_time.get(symbol, 0) == 0:
                        self.last_bar_time[symbol] = current_bar_time

                except Exception:
                    continue

            elapsed    = time.perf_counter() - start
            sleep_time = max(0, config.TICK_FETCH_INTERVAL - elapsed)
            time.sleep(sleep_time)

    # ===============================================================
    # THREAD 2 — TRADE + HISTORY LOADER
    # ===============================================================

    def _trade_loop(self):
        while self._running:
            try:
                cmd = self.trade_queue.get(timeout=1.0)

                if cmd is None:
                    continue

                action = cmd.get('cmd')

                if action == 'detect_and_fetch':        # ← new
                    self._handle_detect_and_fetch(cmd)

                elif action == 'fetch_history':
                    self._handle_fetch_history(cmd)

                elif action == 'execute_trade':
                    self._handle_execute_trade(cmd)

                elif action == 'close_position':
                    self._handle_close_position(cmd)

                elif action == 'close_all':
                    self._handle_close_all(cmd)

                elif action == 'modify_position':
                    self._handle_modify_position(cmd)

                elif action == 'fetch_daily_open':
                    self._handle_fetch_daily_open(cmd)

            except queue.Empty:
                continue
            except Exception as e:
                print(f"⚠️ Thread 2 error: {e}")

    # ===============================================================
    # THREAD 3 — ACCOUNTANT
    # ===============================================================

    def _account_loop(self):
        last_position_count = -1

        while self._running:
            start = time.perf_counter()

            try:
                positions = mt5.positions_get()
                count     = len(positions) if positions is not None else 0

                if count > 0:
                    if self.on_positions_update:
                        raw_positions = self._get_raw_positions()
                        account       = self._get_raw_account()
                        self.on_positions_update(
                            raw_positions, account
                        )

                elif count == 0 and last_position_count != 0:
                    if self.on_positions_update:
                        account = self._get_raw_account()
                        self.on_positions_update([], account)

                last_position_count = count

            except Exception as e:
                print(f"⚠️ Thread 3 positions error: {e}")

            try:
                now = time.time()
                if now - self._last_connection_check >= \
                        config.CONNECTION_CHECK_INTERVAL:
                    self._last_connection_check = now
                    if self.on_connection_update:
                        status = self.check_mt5_connection()
                        self.on_connection_update(status)

            except Exception as e:
                print(f"⚠️ Thread 3 connection error: {e}")

            elapsed    = time.perf_counter() - start
            sleep_time = max(0, config.POSITION_FETCH_INTERVAL - elapsed)
            time.sleep(sleep_time)

    # ======================
    # THREAD LIFECYCLE
    # ======================

    def start_threads(self):
        if self._running:
            return

        self._running = True

        self._thread1 = threading.Thread(
            target=self._tick_loop,
            name='Thread1-BarPulse',
            daemon=True
        )
        self._thread2 = threading.Thread(
            target=self._trade_loop,
            name='Thread2-TradeLoader',
            daemon=True
        )
        self._thread3 = threading.Thread(
            target=self._account_loop,
            name='Thread3-Accountant',
            daemon=True
        )

        self._thread1.start()
        self._thread2.start()
        self._thread3.start()

        print("✅ All three threads started")
        print(f"   Thread 1 — Bar Pulse      ({config.TICK_FETCH_INTERVAL*1000:.0f}ms)")
        print(f"   Thread 2 — Trade + History (queue-driven)")
        print(f"   Thread 3 — Accountant      ({config.POSITION_FETCH_INTERVAL*1000:.0f}ms)")

    def stop_threads(self):
        self._running = False
        self.trade_queue.put(None)
        print("🛑 All threads stopped")

    # ===============================================================
    # THREAD 2 HANDLERS
    # ===============================================================

    def _handle_detect_and_fetch(self, cmd: Dict):
        """
        Detect symbol + fetch history — all in Thread 2.
        Safe — registered Python thread, no GIL conflict.
        Replaces autoDetectSymbol call from detached C++ thread.
        """
        symbol    = cmd.get('symbol')
        timeframe = cmd.get('timeframe')
        count     = cmd.get('count', config.CANDLE_FETCH_COUNT)

        if not symbol or not timeframe:
            return

        # ── Detect symbol — safe, registered thread ──
        detected = self.auto_detect_symbol(symbol)

        if not detected:
            print(f"   ❌ Symbol not found: {symbol}")
            if self.on_symbol_detected:
                self.on_symbol_detected(symbol, timeframe, None)
            return

        print(f"   Detected: {symbol} → {detected}")

        # ── Add to active symbols ──
        self.add_active_symbol(detected)

        # ── Fire detected back to C++ ──
        if self.on_symbol_detected:
            self.on_symbol_detected(symbol, timeframe, detected)

        # ── Fetch history ──
        self._handle_fetch_history({
            'symbol':    symbol,
            'detected':  detected,
            'timeframe': timeframe,
            'count':     count
        })

    def _handle_fetch_history(self, cmd: Dict):
        symbol    = cmd.get('symbol')
        detected  = cmd.get('detected')
        timeframe = cmd.get('timeframe')
        count     = cmd.get('count', config.CANDLE_FETCH_COUNT)

        if not detected or not timeframe:
            return

        mt5_tf = TF_MAP.get(timeframe.upper())
        if mt5_tf is None:
            return

        mt5.symbol_select(detected, True)

        # ── Wake up symbol ──
        for attempt in range(3):
            rates = mt5.copy_rates_from_pos(
                detected, mt5_tf, 0, 1
            )
            if rates is not None and len(rates) > 0:
                break
            print(f"   ⚠️ Wake-up attempt {attempt + 1} failed for {detected}")
            time.sleep(0.1)

        # ── Fetch history — raw numpy ──
        rates = mt5.copy_rates_from_pos(
            detected, mt5_tf, 0, count
        )

        if rates is None or len(rates) == 0:
            print(f"   ❌ No data for {detected} {timeframe}")
            if self.on_history_result:
                self.on_history_result(symbol, timeframe, None)
            return

        # ── Seed tick timestamp ──
        tick = mt5.symbol_info_tick(detected)
        if tick:
            self.last_tick_msc[detected] = tick.time_msc

        # ── Seed last bar time ──
        self.last_bar_time[detected] = int(rates[-1]['time'])

        print(f"✅ {detected} {timeframe}: {len(rates)} candles fetched")

        if self.on_history_result:
            self.on_history_result(symbol, timeframe, rates)

    def _handle_fetch_daily_open(self, cmd: Dict):
        detected = cmd.get('detected')
        if not detected:
            return

        try:
            rates = mt5.copy_rates_from_pos(
                detected, mt5.TIMEFRAME_D1, 0, 1
            )
            if rates is not None and len(rates) > 0:
                daily_open = float(rates[0]['open'])
                print(f"✅ Daily open: {detected} = {daily_open}")
                if self.on_daily_open:
                    self.on_daily_open(detected, daily_open)
            else:
                print(f"   ❌ No D1 data for {detected}")
        except Exception as e:
            print(f"⚠️ Daily open fetch error {detected}: {e}")

    def _handle_execute_trade(self, cmd: Dict):
        result = self.execute_trade(
            cmd.get('symbol'),
            cmd.get('direction'),
            cmd.get('volume'),
            cmd.get('price', 0),
            cmd.get('tp'),
            cmd.get('sl')
        )
        cb = cmd.get('callback')
        if cb:
            cb(result)

    def _handle_close_position(self, cmd: Dict):
        ticket    = cmd.get('ticket')
        ticket_cb = cmd.get('callback')

        positions = mt5.positions_get()
        if positions is None:
            if ticket_cb:
                ticket_cb({
                    'success': False,
                    'error':   'Failed to get positions'
                })
            return

        if not any(p.ticket == int(ticket) for p in positions):
            print(f"⚠️ Ticket {ticket} already closed")
            if ticket_cb:
                ticket_cb({
                    'success': False,
                    'error':   'Position already closed'
                })
            return

        result = self.close_position(ticket)
        if ticket_cb:
            ticket_cb(result)

    def _handle_close_all(self, cmd: Dict):
        cb     = cmd.get('callback')
        result = self.close_all_positions()
        if cb:
            cb(result)

    def _handle_modify_position(self, cmd: Dict):
        result = self.modify_position(
            cmd.get('ticket'),
            cmd.get('sl'),
            cmd.get('tp')
        )
        cb = cmd.get('callback')
        if cb:
            cb(result)

    # ===============================================================
    # COMMAND QUEUE — C++ pushes requests here
    # ===============================================================

    def request_detect_and_fetch(self, symbol: str,
                                  timeframe: str,
                                  count: int = None):
        """
        New — replaces autoDetectSymbol from detached C++ thread.
        All Python work done safely in Thread 2.
        """
        self.trade_queue.put({
            'cmd':       'detect_and_fetch',
            'symbol':    symbol,
            'timeframe': timeframe,
            'count':     count if count is not None
                         else config.CANDLE_FETCH_COUNT
        })

    def request_history(self, symbol: str, detected: str,
                        timeframe: str, count: int = None):
        self.trade_queue.put({
            'cmd':       'fetch_history',
            'symbol':    symbol,
            'detected':  detected,
            'timeframe': timeframe,
            'count':     count if count is not None
                         else config.CANDLE_FETCH_COUNT
        })

    def request_daily_open(self, detected: str):
        self.trade_queue.put({
            'cmd':      'fetch_daily_open',
            'detected': detected
        })

    def request_trade(self, symbol: str, direction: str,
                      volume: float, price: float,
                      tp: float, sl: float,
                      callback=None):
        self.trade_queue.put({
            'cmd':       'execute_trade',
            'symbol':    symbol,
            'direction': direction,
            'volume':    volume,
            'price':     price,
            'tp':        tp,
            'sl':        sl,
            'callback':  callback
        })

    def request_close(self, ticket: int, callback=None):
        self.trade_queue.put({
            'cmd':      'close_position',
            'ticket':   ticket,
            'callback': callback
        })

    def request_close_all(self, callback=None):
        self.trade_queue.put({
            'cmd':      'close_all',
            'callback': callback
        })

    def request_modify(self, ticket: int, sl: float,
                       tp: float, callback=None):
        self.trade_queue.put({
            'cmd':      'modify_position',
            'ticket':   ticket,
            'sl':       sl,
            'tp':       tp,
            'callback': callback
        })

    # ===============================================================
    # RAW DATA FETCHERS — Thread 3 only
    # ===============================================================

    def _get_raw_positions(self) -> List[Dict]:
        if not self.connected:
            return []

        positions = mt5.positions_get()
        if positions is None:
            return []

        result = []
        for pos in positions:
            result.append({
                'ticket':        pos.ticket,
                'symbol':        pos.symbol,
                'type':          pos.type,
                'volume':        pos.volume,
                'open_price':    pos.price_open,
                'current_price': pos.price_current,
                'sl':            pos.sl,
                'tp':            pos.tp,
                'profit':        pos.profit,
                'swap':          pos.swap       if hasattr(pos, 'swap')       else 0,
                'commission':    pos.commission if hasattr(pos, 'commission') else 0,
                'open_time':     pos.time       if hasattr(pos, 'time')       else 0
            })

        return result

    def _get_raw_account(self) -> Optional[Dict]:
        if not self.connected:
            return None

        account = mt5.account_info()
        if not account:
            return None

        return {
            'balance':      account.balance,
            'equity':       account.equity,
            'margin':       account.margin,
            'free_margin':  account.margin_free,
            'margin_level': account.margin_level,
            'currency':     account.currency,
            'server':       account.server,
            'leverage':     account.leverage
        }

    # ===============================================================
    # TRADE EXECUTION — Thread 2 only
    # ===============================================================

    def execute_trade(self, symbol: str, trade_type: str,
                      volume: float, price: float = 0,
                      tp: float = None, sl: float = None) -> Dict:
        if not self.connected:
            return {'success': False, 'error': 'Not connected to MT5'}

        detected = self.get_cached_symbol(symbol)
        if not detected:
            return {'success': False,
                    'error': f'Symbol {symbol} not found'}

        if not self._check_broker_connection(detected):
            return {'success': False, 'error': 'Broker disconnected'}

        if price == 0:
            tick = mt5.symbol_info_tick(detected)
            if not tick:
                return {'success': False,
                        'error': 'Failed to get price'}
            price = tick.ask if trade_type == 'BUY' else tick.bid

        request = {
            "action":       mt5.TRADE_ACTION_DEAL,
            "symbol":       detected,
            "volume":       volume,
            "type":         mt5.ORDER_TYPE_BUY if trade_type == 'BUY'
                            else mt5.ORDER_TYPE_SELL,
            "price":        price,
            "sl":           sl if sl is not None else 0.0,
            "tp":           tp if tp is not None else 0.0,
            "deviation":    config.MT5_DEVIATION,
            "magic":        config.MT5_MAGIC,
            "comment":      config.TRADE_COMMENT,
            "type_time":    mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        try:
            result = mt5.order_send(request)
            if result is None:
                return {'success': False,
                        'error': 'order_send returned None'}
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    'success': False,
                    'error':   f'Trade failed: {result.comment}',
                    'retcode': result.retcode
                }
            return {
                'success':   True,
                'ticket':    result.order,
                'price':     result.price,
                'volume':    result.volume,
                'symbol':    detected,
                'direction': trade_type,
                'timestamp': int(time.time()),
                'message':   f'Trade executed: {trade_type} {detected} '
                             f'{volume}L @ {result.price}'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def modify_position(self, ticket: int,
                        sl: float = None,
                        tp: float = None) -> Dict:
        if not self.connected:
            return {'success': False, 'error': 'Not connected to MT5'}

        try:
            all_positions = mt5.positions_get()
            if all_positions is None:
                return {'success': False,
                        'error': 'Failed to get positions'}

            position = next(
                (p for p in all_positions if p.ticket == ticket),
                None
            )

            if not position:
                return {'success': False,
                        'error': f'Position not found: {ticket}'}

            if not self._check_broker_connection(position.symbol):
                return {'success': False,
                        'error': 'Broker disconnected'}

            request = {
                "action":   mt5.TRADE_ACTION_SLTP,
                "symbol":   position.symbol,
                "position": ticket,
                "sl":       sl if sl is not None else position.sl,
                "tp":       tp if tp is not None else position.tp,
            }

            result = mt5.order_send(request)
            if result is None:
                return {'success': False,
                        'error': 'order_send returned None'}
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    'success': False,
                    'error':   f'Modify failed: {result.comment}',
                    'retcode': result.retcode
                }
            return {
                'success': True,
                'ticket':  ticket,
                'message': f'Position {ticket} modified. SL:{sl} TP:{tp}'
            }

        except Exception as e:
            return {'success': False, 'error': str(e)}

    def close_position(self, ticket) -> Dict:
        if not self.connected:
            return {'success': False, 'error': 'Not connected to MT5'}

        try:
            ticket_int = int(ticket)
        except (ValueError, TypeError):
            return {'success': False,
                    'error': f'Invalid ticket format: {ticket}'}

        all_positions = mt5.positions_get()
        if all_positions is None:
            return {'success': False,
                    'error': 'Failed to get positions'}

        position = next(
            (p for p in all_positions if p.ticket == ticket_int),
            None
        )

        if not position:
            return {'success': False,
                    'error': f'Position not found: {ticket_int}'}

        if not self._check_broker_connection(position.symbol):
            return {'success': False,
                    'error': 'Broker disconnected'}

        tick = mt5.symbol_info_tick(position.symbol)
        if not tick:
            return {'success': False,
                    'error': 'Failed to get current price'}

        close_price = tick.bid if position.type == 0 else tick.ask
        close_type  = (mt5.ORDER_TYPE_SELL if position.type == 0
                       else mt5.ORDER_TYPE_BUY)

        request = {
            "action":       mt5.TRADE_ACTION_DEAL,
            "symbol":       position.symbol,
            "volume":       position.volume,
            "type":         close_type,
            "position":     position.ticket,
            "price":        close_price,
            "deviation":    config.MT5_DEVIATION,
            "magic":        config.MT5_MAGIC,
            "comment":      config.CLOSE_TRADE_COMMENT,
            "type_time":    mt5.ORDER_TIME_GTC,
            "type_filling": mt5.ORDER_FILLING_IOC,
        }

        try:
            result = mt5.order_send(request)
            if result is None:
                return {'success': False,
                        'error': 'order_send returned None'}
            if result.retcode != mt5.TRADE_RETCODE_DONE:
                return {
                    'success': False,
                    'error':   f'Close failed: {result.comment} '
                               f'(retcode: {result.retcode})',
                    'retcode': result.retcode
                }
            return {
                'success': True,
                'ticket':  ticket_int,
                'symbol':  position.symbol,
                'profit':  position.profit,
                'message': f'Position {ticket_int} closed'
            }
        except Exception as e:
            return {'success': False, 'error': str(e)}

    def close_all_positions(self) -> Dict:
        if not self.connected:
            return {'success': False, 'error': 'Not connected to MT5'}

        if not self._check_broker_connection_terminal():
            return {'success': False, 'error': 'Broker disconnected'}

        positions = mt5.positions_get()
        if positions is None:
            return {'success': False,
                    'error': 'Failed to get positions'}

        if len(positions) == 0:
            return {
                'success': True,
                'message': 'No open positions to close',
                'details': {'closed': 0, 'total_profit': 0}
            }

        closed_count = 0
        total_profit = 0

        for position in positions:
            try:
                result = self.close_position(position.ticket)
                if result['success']:
                    closed_count += 1
                    total_profit += result.get('profit', 0)
            except Exception as e:
                print(f"⚠️ Error closing {position.ticket}: {e}")

        return {
            'success': True,
            'message': f'Closed {closed_count} of {len(positions)} positions',
            'details': {
                'closed':       closed_count,
                'total':        len(positions),
                'total_profit': total_profit
            }
        }

    # ======================
    # HEALTH CHECK
    # ======================

    def health_check(self) -> Dict:
        conn_status = self.check_mt5_connection()
        return {
            'connected':         self.connected,
            'mt5_status':        conn_status,
            'symbols_available': len(self.available_symbols),
            'symbols_cached':    len(self.symbol_cache),
            'active_symbols':    len(self._active_symbols),
            'utc_offset':        self.utc_offset,
            'last_check':        datetime.now().isoformat()
        }


# ===============================================================
# GLOBAL INSTANCE
# ===============================================================

connector = MT5Connector()