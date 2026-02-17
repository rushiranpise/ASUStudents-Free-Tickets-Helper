# 🎟️ ASU Students Free Tickets Helper

A Tampermonkey userscript that automatically detects and selects **free ($0) ASU student tickets** on Ticketmaster and adds them to your cart.

Built to save time by eliminating the need to manually expand each event and check which ticket types are free.

> ⚠️ Disclaimer: Automating interactions with Ticketmaster may violate their Terms of Service. This script is intended for **personal convenience only**. Use responsibly and at your own risk.

---

## ✨ Features

- ✅ Automatically expands event sections  
- ✅ Detects visible ticket quantity inputs  
- ✅ Parses ticket prices from the DOM  
- ✅ Selects **only free tickets ($0)**  
- ✅ Skips paid ticket options safely  
- ✅ Clicks **Add to Cart** automatically (only if free tickets were selected)  
- ✅ Watches for dynamically loaded content  
- ✅ Manual trigger support via browser console  

---

## 🌐 Supported Pages

The script runs on:

```

[https://am.ticketmaster.com/asustudents/](https://am.ticketmaster.com/asustudents/)*

```

Example supported pages:

- `/buy/bbstudent`
- `/buy/gymstudents`
- `/buy/hohstudent`
- `/buy/mbbstudent`
- `/buy/wbbstudents`
- `/buy/wlstudents`
- `/buy/wrstudents`
- `/buy/sbstudent`
- `/shopping-cart`

---

## 🚀 Installation

### 1️⃣ Install Tampermonkey

Download and install Tampermonkey:

- Chrome / Edge / Brave:  
  https://www.tampermonkey.net/

- Firefox (Greasemonkey also supported)

---

### 2️⃣ Add the Script

1. Open Tampermonkey Dashboard  
2. Click **Create a new script**
3. Replace the template with the userscript code from this repository
4. Save the script
5. Make sure it is **enabled**

---

## ▶️ Usage

1. Navigate to any ASU student ticket page:
```

[https://am.ticketmaster.com/asustudents/buy/](https://am.ticketmaster.com/asustudents/buy/)...

````

2. Wait ~10 seconds (default delay).

3. The script will:
- Expand each event
- Select all available **free tickets**
- Click **Add to Cart** (if applicable)

---

### 🧪 Manual Trigger (Optional)

Open the browser console and run:

```javascript
window.__autoPlusAndCart();
````

This forces the script to run immediately.

---

## ⚙️ Configuration

You can customize behavior inside the script:

```javascript
const INITIAL_DELAY_MS = 10000;      // Delay before first execution
const CLICK_DELAY_MS = 300;          // Delay between button clicks
const WAIT_AFTER_EXPAND_MS = 600;    // Wait after expanding event
const WAIT_AFTER_PROCESS_MS = 700;   // Wait before clicking Add to Cart
const MAX_TRIES = 3;                 // Retry attempts per ticket input
const EXPAND_POLL_TIMEOUT_MS = 2500; // Timeout waiting for lazy-render
```

If the site loads slowly, increase `INITIAL_DELAY_MS`.

---

## 🧠 How It Works

1. Waits for page load + configured delay
2. Finds all `.event` elements
3. Expands each event safely
4. Locates ticket quantity inputs
5. Detects associated price text
6. If price is `$0`, sets quantity to `1`
7. Clicks **Add to Cart** if at least one free ticket was added

If price cannot be confidently determined, the script **skips the ticket** to prevent accidental purchases.

---

## 🔍 Safety Behavior

* Never selects tickets unless price parses to `0`
* Defaults to **skip** if price detection fails
* Does not send any data externally
* Runs entirely in your browser

---

## 🛠 Troubleshooting

**Script not running?**

* Open Developer Console (`F12`)
* Look for logs:

  * `Script loaded`
  * `Running helper for free tickets...`

**Ticketmaster updated their UI?**

* Selectors may need updating:

  * `expand_collapse_button`
  * `increase_quantity_button`
  * `.ticketTypeQuantity`

---

## 🤝 Contributing

Pull requests are welcome.

Ideas:

* Improve price detection logic
* Improve selector resilience
* Add support for markup changes
* Improve performance tuning

---

## 📜 License

MIT License

You are free to use, modify, and distribute this project.

---

## ⚠️ Ethical Use Reminder

Do not use this script for:

* Ticket scalping
* Bulk automation
* Abusive high-frequency refreshes
* Circumventing ticket limits

Respect ASU and Ticketmaster policies.

---

## 👨‍💻 Author

Built for ASU students who are tired of clicking “+” 20 times manually.
