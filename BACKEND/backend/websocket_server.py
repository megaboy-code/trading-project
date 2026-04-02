# ===============================================================
# WEBSOCKET_SERVER.PY - WebSocket Connection Handling & Orchestration
# ===============================================================

import asyncio
import websockets
import socket
import json
from typing import Set
from connector import connector
from chart_manager import chart_manager
from broadcast_manager import broadcast_manager
from message_handler import message_handler
from strategy_manager import strategy_manager
import config


class WebSocketServer:
    """Manages WebSocket connections and orchestrates all components"""

    def __init__(self, host=None, port=None):
        self.host = host or config.WS_HOST
        self.port = port or config.WS_PORT
        self.connected_clients: Set = set()
        self.running = False
        self.shutdown_event = asyncio.Event()

        # Background tasks
        self.tasks = []

        print(f"🚀 WebSocket Server initializing on {self.host}:{self.port}")

    # ==================== SETUP ====================

    def setup(self):
        """Setup all components and wire them together"""
        print("🔄 Setting up components...")

        # Give broadcast_manager the broadcast callback
        broadcast_manager.set_broadcast_callback(self.broadcast_to_all)

        # Set reconnection callback
        broadcast_manager.set_reconnect_callback(self.handle_reconnection)

        # Setup strategy manager callbacks
        strategy_manager.set_send_callback(self.broadcast_to_all)
        strategy_manager.trade_executor = self.execute_strategy_trade
        strategy_manager.data_fetcher   = self.fetch_strategy_data

        print("✅ Components configured")

    # ==================== BROADCAST TO ALL CLIENTS ====================

    async def broadcast_to_all(self, message):
        """Broadcast message to all connected clients"""
        for client in list(self.connected_clients):
            try:
                await client.send(json.dumps(message, default=str))
            except Exception:
                self.connected_clients.discard(client)

    # ==================== STRATEGY MANAGER INTEGRATION ====================

    async def fetch_strategy_data(self, symbol: str, timeframe: str, count: int = 200):
        """Fetch historical data for strategies"""
        try:
            detected = await chart_manager.detect_symbol(symbol)
            if not detected:
                return []

            # ✅ Pass timeframe string — connector.get_initial_candles expects 'H1' not mt5 constant
            candles, _ = connector.get_initial_candles(symbol, detected, timeframe, count)
            return candles

        except Exception as e:
            print(f"❌ Strategy data fetch error: {e}")
            return []

    async def execute_strategy_trade(self, symbol: str, trade_type: str,
                                     volume: float, price: float):
        """Execute trade from Strategy Manager"""
        try:
            result = connector.execute_trade(symbol, trade_type, volume, price)
            return result
        except Exception as e:
            return {'success': False, 'error': str(e)}

    # ==================== RECONNECTION HANDLER ====================

    async def handle_reconnection(self):
        """Handle MT5 reconnection - restore chart"""
        await broadcast_manager.restore_last_chart()

    # ==================== CLIENT CONNECTION HANDLING ====================

    async def handle_client(self, websocket):
        """Handle individual WebSocket client connection"""
        self.connected_clients.add(websocket)

        try:
            while True:
                try:
                    message = await asyncio.wait_for(websocket.recv(), timeout=0.01)
                    await message_handler.process_message(message, websocket)
                except asyncio.TimeoutError:
                    continue

        except websockets.exceptions.ConnectionClosed:
            pass
        except Exception as e:
            print(f"❌ WebSocket error: {e}")
        finally:
            if websocket in self.connected_clients:
                self.connected_clients.remove(websocket)

    # ==================== SERVER LIFECYCLE ====================

    async def start(self):
        """Start WebSocket server and all background tasks"""
        self.running = True
        broadcast_manager.start()

        print(f"\n📊 Server Status:")
        print(f"   • MT5: {'✅ Connected' if connector.connected else '❌ Disconnected'}")
        print(f"   • Host: {self.host}")
        print(f"   • Port: {self.port}")
        print(f"   • Strategies: ✅ ENABLED")
        print(f"   • Reconnection: ✅ ENABLED")
        print(f"\n✅ Server ready. Waiting for connections...")

        # Start all broadcast loops
        positions_task         = asyncio.create_task(broadcast_manager.broadcast_positions())
        prices_task            = asyncio.create_task(broadcast_manager.broadcast_prices())
        chart_updates_task     = asyncio.create_task(broadcast_manager.broadcast_chart_updates())
        connection_monitor_task = asyncio.create_task(broadcast_manager.broadcast_connection_status())

        self.tasks = [
            positions_task,
            prices_task,
            chart_updates_task,
            connection_monitor_task
        ]

        # Start WebSocket server
        async with websockets.serve(
            self.handle_client,
            self.host,
            self.port,
            family=socket.AF_INET
        ):
            print(f"✅ WebSocket server listening on ws://{self.host}:{self.port}")

            # Wait for shutdown signal
            await self.shutdown_event.wait()

            # Cleanup
            print("🛑 Shutdown requested, cleaning up...")
            await self.cleanup()

    async def cleanup(self):
        """Cleanup all background tasks"""
        self.running = False
        broadcast_manager.stop()

        for task in self.tasks:
            task.cancel()

        for task in self.tasks:
            try:
                await task
            except asyncio.CancelledError:
                pass

        print("✅ All tasks stopped")

    def stop(self):
        """Stop the server"""
        self.running = False
        self.shutdown_event.set()


# ===============================================================
# FACTORY FUNCTION
# ===============================================================

def create_server(host=None, port=None):
    """Create and setup WebSocket server"""
    server = WebSocketServer(host, port)
    server.setup()
    return server