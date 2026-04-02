# ===============================================================
# MAIN_LAUNCHER.PY - Entry Point
# ===============================================================

import asyncio
import signal
from connector import connector
from websocket_server import create_server


class Application:
    """Main application entry point"""

    def __init__(self):
        self.server = None

        # Setup signal handlers
        signal.signal(signal.SIGINT, self.signal_handler)
        signal.signal(signal.SIGTERM, self.signal_handler)

    def signal_handler(self, signum, frame):
        """Handle shutdown signals"""
        print(f"\n⚠️ Received shutdown signal {signum}")
        if self.server:
            self.server.stop()

    async def run(self):
        """Run the application"""
        print("🔗 Connecting to MT5...")

        if not connector.connect():
            print("⚠️ Failed to connect to MT5. Server will run without MT5 data.")
        else:
            print("✅ MT5 Connected successfully")

        try:
            self.server = create_server()
            await self.server.start()

        except KeyboardInterrupt:
            print("\n👋 Keyboard interrupt received")
        except Exception as e:
            print(f"❌ Server error: {e}")
            import traceback
            traceback.print_exc()
        finally:
            if self.server:
                self.server.stop()
            connector.disconnect()
            print("✅ Server shutdown complete")


# ===============================================================
# MAIN ENTRY POINT
# ===============================================================

async def main():
    """Main entry point"""
    app = Application()
    await app.run()


if __name__ == "__main__":
    asyncio.run(main())