import os
import time
from http.server import SimpleHTTPRequestHandler
import socketserver
import threading
from selenium import webdriver
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from webdriver_manager.chrome import ChromeDriverManager

PORT = 8089
FILE_NAME = "shadownet.html"

# 1. Spawn a local standalone network thread for your code assets
class ThreadedHTTPServer:
    def __init__(self):
        handler = SimpleHTTPRequestHandler
        self.server = socketserver.TCPServer(("", PORT), handler)
        self.server_thread = threading.Thread(target=self.server.serve_forever)
        self.server_thread.daemon = True

    def start(self):
        self.server_thread.start()
        print(f"[✔] Background server listening on local port {PORT}")

    def stop(self):
        self.server.shutdown()
        self.server.server_close()
        print("[✔] Background assets server terminated safely.")

def generate_screenshots():
    # Instantiate the background static frame server
    server = ThreadedHTTPServer()
    server.start()
    time.sleep(1) # Yield to network sockets bind loops

    # Configure isolated headless context window metrics
    options = webdriver.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--force-device-scale-factor=2.0") # Forces high-DPI output rendering

    driver = webdriver.Chrome(service=Service(ChromeDriverManager().install()), options=options)
    
    # Exact dimensional target scaling matching your phone frame wrappers
    driver.set_window_size(480, 850)
    
    target_url = f"http://localhost:{PORT}/{FILE_NAME}"
    print(f"[*] Navigating headless pipeline into: {target_url}")
    driver.get(target_url)
    time.sleep(2) # Stabilize engine script iterations and animations

    try:
        # ── FIGURE B.1: MESH TOPOLOGY MAP VIEW ──
        print("[*] Recording Figure B.1: Live Mesh Topology Canvas...")
        driver.execute_script("switchTab('mesh');")
        time.sleep(1)
        phone_wrapper = driver.find_element(By.ID, "app")
        phone_wrapper.screenshot("Figure_B1_Mesh_Map.png")

        # ── FIGURE B.2: MESSAGE THREAD DIRECTORY VIEW ──
        print("[*] Recording Figure B.2: Target Active Conversations List...")
        driver.execute_script("switchTab('messages');")
        time.sleep(1)
        phone_wrapper.screenshot("Figure_B2_Messages_List.png")

        # ── FIGURE B.3: CHAT THREAD WITH OPEN TACTICAL SUGGESTIONS ENGINE ──
        print("[*] Interacting with conversation elements for Figure B.3...")
        # Simulates opening the primary pre-seeded chat container sequence safely
        chat_items = driver.find_elements(By.CLASS_NAME, "conv-item")
        if chat_items:
            chat_items[0].click()
            time.sleep(0.5)
            # Toggles suggestion system container tray class arrays manually via DOM
            driver.execute_script("if(!suggOpen) toggleSuggestions();")
            time.sleep(1)
            phone_wrapper.screenshot("Figure_B3_Chat_Detail_Suggestions.png")
            
            # Escape from nested chat view stack state back into standard base layer tabs
            driver.execute_script("closeChat();")
            time.sleep(0.5)

        # ── FIGURE B.4: NODE DISCOVERY SELECTOR VIEW ──
        print("[*] Recording Figure B.4: Peer Discovery Selector Panel...")
        driver.execute_script("switchTab('messages');")
        time.sleep(0.3)
        new_chat_buttons = driver.find_elements(By.CLASS_NAME, "new-chat-btn")
        if new_chat_buttons:
            new_chat_buttons[0].click()
            time.sleep(1)
            phone_wrapper.screenshot("Figure_B4_Node_Discovery.png")
            # Clear modal state framework safely
            driver.execute_script("closeNewChatModal();")
            time.sleep(0.5)

        # ── FIGURE B.5: STRATEGIC MESH DIRECTORY DIRECT VIEW ──
        print("[*] Recording Figure B.5: Master Network Directory Database view...")
        driver.execute_script("switchTab('nodes');")
        time.sleep(1)
        phone_wrapper.screenshot("Figure_B5_Mesh_Directory.png")

        # ── FIGURE B.6: MESH NETWORK SETTINGS CONFIGURATION SCREEN ──
        print("[*] Recording Figure B.6: Operational Parameters Screen...")
        driver.execute_script("switchTab('settings');")
        time.sleep(1)
        phone_wrapper.screenshot("Figure_B6_Settings_Dashboard.png")

        print("\n[✔] Automated screen captures exported successfully to your project folder!")

    except Exception as error:
        print(f"[✖] Pipeline automation process broke unexpectedly: {str(error)}")
    finally:
        driver.quit()
        server.stop()

if __name__ == "__main__":
    generate_screenshots()