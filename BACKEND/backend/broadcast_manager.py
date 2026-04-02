# ===============================================================
# BROADCAST_MANAGER.PY - All Broadcast Loops & Data Sending
# ===============================================================

import asyncio
import json
from datetime import datetime
from typing import Optional, Callable
from connector import connector
from chart_manager import chart_manager
from strategy_manager import strategy_manager
import config


class BroadcastManager:

    def __init__(self):
        self.running = False
        self.shutdown_event = asyncio.Event()

        self.broadcast_callback: Optional[Callable] = None

        self.position_interval    = config.POSITION_FETCH_INTERVAL
        self.chart_update_interval = config.DATA_FETCH_INTERVAL
        self.price_interval       = getattr(config, 'PRICE_STREAM_INTERVAL', 0.5)
        self.connection_interval  = config.CONNECTION_CHECK_INTERVAL

        self.last_connection_status = None

        self._update_counter = 0
        self._price_counter  = 0

        self.on_reconnect_callback = None

    def set_broadcast_callback(self, callback: Callable):
        self.broadcast_callback = callback

    def set_reconnect_callback(self, callback):
        self.on_reconnect_callback = callback

    # ==================== BROADCAST HELPER ====================

    async def broadcast_to_all(self, message):
        if self.broadcast_callback:
            await self.broadcast_callback(message)

    # ==================== CHART DATA SENDING ====================

    async def send_initial_data(self, websocket, symbol: str, timeframe: str):
        """
        Send initial candle data to frontend.
        Then separately send indicator history if any strategies match.
        """
        success, error, candles = await chart_manager.fetch_initial_candles(symbol, timeframe)

        if not success:
            await websocket.send(json.dumps(error))
            return

        # ✅ Step 1 — Send chart data
        chart_data = {
            'type':      'initial',
            'symbol':    symbol,
            'timeframe': timeframe,
            'data':      candles,
            'count':     len(candles),
            'timestamp': datetime.now().isoformat()
        }

        await websocket.send(json.dumps(chart_data, default=str))

        # ✅ Step 2 — Send strategy indicator history if strategies active
        indicator_history = strategy_manager.get_indicator_history(
            symbol, timeframe, candles
        )

        if indicator_history:
            indicator_message = {
                'type':      'strategy_initial',
                'symbol':    symbol,
                'timeframe': timeframe,
                'indicators': indicator_history,
                'timestamp': datetime.now().isoformat()
            }
            await websocket.send(json.dumps(indicator_message, default=str))
            print(f"📊 Sent indicator history for {len(indicator_history)} strategies "
                  f"on {symbol} {timeframe}")

    async def send_chart_updates(self):
        """
        Send chart candle update to all clients.
        Strategy indicator updates are pushed by strategy_manager on candle close.
        """
        state = chart_manager.get_chart_state()

        if not chart_manager.is_chart_valid(state):
            return

        try:
            latest_candle = chart_manager.fetch_candle_update()

            if not latest_candle:
                return

            # ✅ Send candle update only
            message = {
                'type':      'update',
                'symbol':    state['symbol'],
                'timeframe': state['timeframe'],
                'data':      latest_candle,
                'timestamp': datetime.now().isoformat()
            }

            await self.broadcast_to_all(message)

            self._update_counter += 1
            if self._update_counter % 20 == 0:
                print(f"📊 Chart update: {state['symbol']} {state['timeframe']}")

        except Exception as e:
            print(f"❌ Chart update error: {e}")

    async def send_current_price(self, websocket=None):
        """Broadcast real-time price updates"""
        state = chart_manager.get_chart_state()

        if not chart_manager.is_chart_valid(state):
            return

        try:
            price_data = connector.get_current_price_with_symbol(
                state['symbol'],
                state['detected']
            )

            if not price_data:
                return

            price_message = {
                'type':      'price_update',
                'symbol':    state['symbol'],
                'bid':       price_data['bid'],
                'ask':       price_data['ask'],
                'spread':    price_data['spread'],
                'time':      price_data['time'],
                'timestamp': datetime.now().isoformat()
            }

            if websocket:
                await websocket.send(json.dumps(price_message, default=str))
            else:
                await self.broadcast_to_all(price_message)

            self._price_counter += 1
            if self._price_counter % 40 == 0:
                print(f"💰 Price streaming: {state['symbol']}")

        except Exception as e:
            print(f"❌ Price error: {e}")

    # ==================== POSITIONS & ACCOUNT ====================

    async def send_positions_update(self, websocket=None, positions=None):
        """Send positions and account update to client(s)"""
        if positions is None and connector.connected:
            positions = connector.get_positions()

        update_message = {
            'type':      'positions_update',
            'positions': positions or [],
            'count':     len(positions or []),
            'timestamp': datetime.now().isoformat()
        }

        # ✅ Always fetch account regardless of positions
        if connector.connected:
            account_info = connector.get_account_info() or {}
            update_message['account'] = account_info

        if websocket:
            await websocket.send(json.dumps(update_message))
        else:
            await self.broadcast_to_all(update_message)

    async def send_account_info(self, websocket):
        """Send account info to client"""
        account_info = {}
        if connector.connected:
            account_info = connector.get_account_info() or {}

        update_message = {
            'type':      'account_info',
            'account':   account_info,
            'timestamp': datetime.now().isoformat()
        }

        await websocket.send(json.dumps(update_message))

    # ==================== CONNECTION MONITORING ====================

    async def broadcast_connection_status(self):
        """Broadcast MT5 connection status with reconnection logic"""
        while self.running and not self.shutdown_event.is_set():
            if self.broadcast_callback:
                try:
                    mt5_status = connector.check_mt5_connection()

                    connection_changed = (
                        self.last_connection_status is None or
                        self.last_connection_status['mt5_connected'] != mt5_status['mt5_connected']
                    )

                    if connection_changed:
                        status_message = {
                            'type':      'connection_status',
                            'data':      mt5_status,
                            'timestamp': datetime.now().isoformat()
                        }

                        await self.broadcast_to_all(status_message)

                        if mt5_status['mt5_connected']:
                            print(f"🟢 MT5 Connected - Restoring chart...")
                            if self.on_reconnect_callback:
                                await self.on_reconnect_callback()
                        else:
                            print(f"🔴 MT5 Disconnected")
                            chart_manager.save_state_for_reconnection()

                        self.last_connection_status = mt5_status

                except Exception as e:
                    print(f"❌ Connection status error: {e}")

            try:
                await asyncio.wait_for(
                    self.shutdown_event.wait(),
                    timeout=self.connection_interval
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    # ==================== BROADCAST LOOPS ====================

    async def broadcast_positions(self):
        """Loop: broadcast positions and account periodically"""
        while self.running and not self.shutdown_event.is_set():
            if self.broadcast_callback and connector.connected:
                try:
                    await self.send_positions_update()
                except Exception as e:
                    print(f"❌ Position error: {e}")

            try:
                await asyncio.wait_for(
                    self.shutdown_event.wait(),
                    timeout=self.position_interval
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def broadcast_prices(self):
        """Loop: broadcast prices periodically"""
        while self.running and not self.shutdown_event.is_set():
            if self.broadcast_callback:
                try:
                    await self.send_current_price()
                except Exception as e:
                    print(f"❌ Price error: {e}")

            try:
                await asyncio.wait_for(
                    self.shutdown_event.wait(),
                    timeout=self.price_interval
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    async def broadcast_chart_updates(self):
        """Loop: broadcast chart updates periodically"""
        while self.running and not self.shutdown_event.is_set():
            if self.broadcast_callback:
                try:
                    await self.send_chart_updates()
                except Exception as e:
                    print(f"❌ Chart update error: {e}")

            try:
                await asyncio.wait_for(
                    self.shutdown_event.wait(),
                    timeout=self.chart_update_interval
                )
            except asyncio.TimeoutError:
                continue
            except asyncio.CancelledError:
                break

    # ==================== RECONNECTION ====================

    async def restore_last_chart(self):
        """Restore last active chart when MT5 reconnects"""
        last_state = chart_manager.get_reconnection_state()
        if not last_state:
            return

        print(f"🔄 Restoring last chart: {last_state['symbol']} {last_state['timeframe']}")

        connector.clear_symbol_cache(last_state['symbol'])
        chart_manager.clear_chart_state()

        success, error, candles = await chart_manager.fetch_initial_candles(
            last_state['symbol'],
            last_state['timeframe']
        )

        if success:
            # ✅ Restore chart data
            chart_data = {
                'type':      'initial',
                'symbol':    last_state['symbol'],
                'timeframe': last_state['timeframe'],
                'data':      candles,
                'count':     len(candles),
                'timestamp': datetime.now().isoformat()
            }
            await self.broadcast_to_all(chart_data)

            # ✅ Restore indicator history if strategies match
            indicator_history = strategy_manager.get_indicator_history(
                last_state['symbol'], last_state['timeframe'], candles
            )

            if indicator_history:
                indicator_message = {
                    'type':       'strategy_initial',
                    'symbol':     last_state['symbol'],
                    'timeframe':  last_state['timeframe'],
                    'indicators': indicator_history,
                    'timestamp':  datetime.now().isoformat()
                }
                await self.broadcast_to_all(indicator_message)
                print(f"📊 Restored indicator history after reconnection")

    # ==================== LIFECYCLE ====================

    def start(self):
        self.running = True

    def stop(self):
        self.running = False
        self.shutdown_event.set()


# ===============================================================
# GLOBAL INSTANCE
# ===============================================================

broadcast_manager = BroadcastManager()