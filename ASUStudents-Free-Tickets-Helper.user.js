// ==UserScript==
// @name         ASUStudents Free Tickets Helper
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Automatically detects and selects all available free student tickets, skips paid options, and adds them to cart after page load.
// @match        https://am.ticketmaster.com/asustudents/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
    'use strict';

    // ================= CONFIG =================
    const INITIAL_DELAY_MS = 10000;      // 10s initial wait
    const CLICK_DELAY_MS = 300;          // pause between clicks
    const WAIT_AFTER_EXPAND_MS = 600;    // wait after expand
    const WAIT_AFTER_PROCESS_MS = 700;   // wait before clicking Add to Cart
    const MAX_TRIES = 3;
    const EXPAND_POLL_TIMEOUT_MS = 2500;
    // ==========================================

    const sleep = ms => new Promise(r => setTimeout(r, ms));

    function dispatchInputAndChange(el) {
        if (!el) return;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
        el.dispatchEvent(new Event('blur', { bubbles: true }));
    }

    // === Helpers to detect visible ticket inputs in an event ===
    function eventHasVisibleInputs(eventEl) {
        if (!eventEl) return false;
        const inputs = Array.from(eventEl.querySelectorAll('input.ticketTypeQuantity, input[data-testid="seat_quantiy_input"]'));
        return inputs.some(inp => inp.offsetParent !== null);
    }

    // === Strict expand: only click chevron button[data-testid="expand_collapse_button"] ===
    async function ensureEventExpanded(eventEl) {
        if (!eventEl) return false;

        // If inputs already visible, nothing to do
        if (eventHasVisibleInputs(eventEl)) return true;

        const expandBtn = eventEl.querySelector('button[data-testid="expand_collapse_button"]');
        if (!expandBtn) {
            // no safe expand control found
            return false;
        }

        // If already expanded by attribute, wait a moment
        if (expandBtn.getAttribute('aria-expanded') === 'true') {
            await sleep(WAIT_AFTER_EXPAND_MS);
            return eventHasVisibleInputs(eventEl);
        }

        try {
            expandBtn.focus();
            expandBtn.click();
            await sleep(WAIT_AFTER_EXPAND_MS);

            // Poll for lazy-rendered inputs
            const start = Date.now();
            while (Date.now() - start < EXPAND_POLL_TIMEOUT_MS) {
                if (eventHasVisibleInputs(eventEl)) return true;
                await sleep(150);
            }
            return eventHasVisibleInputs(eventEl);
        } catch (err) {
            console.warn('[Auto+1] expand failed', err);
            return false;
        }
    }

    // === Parse price text to a number (returns NaN if not found) ===
    function parsePriceText(priceText) {
        if (!priceText) return NaN;
        // remove currency symbols, whitespace, commas
        const cleaned = priceText.replace(/[^\d.-]/g, '');
        const num = parseFloat(cleaned);
        return Number.isFinite(num) ? num : NaN;
    }

    // === Find the price element (close to a given input). Return numeric price or NaN ===
    function findPriceForInput(inputEl) {
        if (!inputEl) return NaN;

        // 1) Look for a nearby .quantity span inside the same titleAndQuantity block
        const container = inputEl.closest('.titleAndQuantity') || inputEl.closest('.ticketInfo') || inputEl.closest('.ticketTypesContainer') || inputEl.closest('.event');
        if (!container) return NaN;

        // Common pattern in the markup: <span class="quantity">$0.00</span>
        let priceElem = container.querySelector('.quantity, .greenPrice, .selectionCartPriceBlock .greenPrice, .selectionCartPriceBlock span');
        if (priceElem && priceElem.textContent.trim()) {
            const p = parsePriceText(priceElem.textContent);
            if (!Number.isNaN(p)) return p;
        }

        // 2) Search upwards for a .titleAndQuantity sibling that contains price
        const titleAndQuantity = container.querySelector('.titleAndQuantity');
        if (titleAndQuantity) {
            const q = titleAndQuantity.querySelector('.quantity, span');
            if (q && q.textContent) {
                const p = parsePriceText(q.textContent);
                if (!Number.isNaN(p)) return p;
            }
        }

        // 3) Search the whole ticketInfo block for any $... text near the input
        const ticketInfo = inputEl.closest('.ticketInfo') || container;
        if (ticketInfo) {
            const priceCandidates = Array.from(ticketInfo.querySelectorAll('span, div')).map(n => n.textContent || '').filter(t => t.includes('$'));
            for (const txt of priceCandidates) {
                const v = parsePriceText(txt);
                if (!Number.isNaN(v)) return v;
            }
        }

        // 4) fallback: search the event for any span with $ and pick a close one
        const eventRoot = inputEl.closest('.event') || inputEl.closest('.eventsContainer');
        if (eventRoot) {
            const spans = Array.from(eventRoot.querySelectorAll('span, div'));
            // look for nearest by DOM distance (index)
            for (const s of spans) {
                const txt = (s.textContent || '').trim();
                if (txt.includes('$')) {
                    const v = parsePriceText(txt);
                    if (!Number.isNaN(v)) return v;
                }
            }
        }

        return NaN;
    }

    // === Return true if the ticket corresponding to inputEl is free (price === 0) ===
    function ticketIsFree(inputEl) {
        const price = findPriceForInput(inputEl);
        if (Number.isNaN(price)) {
            // If price can't be found, assume NOT free (safe default)
            return false;
        }
        return Math.abs(price) < 1e-6; // treat tiny rounding as zero
    }

    // === Find + button within the ticket area ===
    function findIncreaseButtonForInput(inputEl) {
        if (!inputEl) return null;
        const ticketInfo = inputEl.closest('.ticketInfo') || inputEl.closest('.ticketTypesContainer') || inputEl.parentElement;
        if (!ticketInfo) return null;
        let btn = ticketInfo.querySelector('button[data-testid="increase_quantity_button"], .BuildABundleEventAddStepper, button[aria-label*="Increase quantity"], button[aria-label^="Increase"]');
        if (btn) return btn;
        const visibleButtons = Array.from(ticketInfo.querySelectorAll('button')).filter(b => !(b.classList && b.classList.contains('teamColorRingEffect')) && (b.offsetParent !== null));
        if (visibleButtons.length) return visibleButtons.find(b => (b.textContent || '').trim().length > 0) || visibleButtons[0];
        return null;
    }

    // === Try to set a single input to 1 (but ONLY if the ticket is free) ===
    async function trySetInputToOneIfFree(inputEl) {
        if (!inputEl) return false;

        // Check price first — skip if not free
        if (!ticketIsFree(inputEl)) {
            // console.log('[Auto+1] Skipping paid ticket for input:', inputEl);
            return false;
        }

        const normalize = v => (v === null || v === undefined) ? '' : String(v).trim();
        const cur = normalize(inputEl.value || inputEl.getAttribute('value') || '');
        if (cur === '1' || cur === '1.0') return true;

        const incBtn = findIncreaseButtonForInput(inputEl);
        if (incBtn && !incBtn.disabled && incBtn.getAttribute('aria-disabled') !== 'true' && incBtn.offsetParent !== null) {
            try {
                incBtn.focus();
                incBtn.click();
                await sleep(CLICK_DELAY_MS);
                dispatchInputAndChange(inputEl);
                await sleep(120);
                const newVal = normalize(inputEl.value || inputEl.getAttribute('value') || '');
                if (newVal === '1' || newVal === '1.0') return true;
                // try one more time if needed
                if (!incBtn.disabled && incBtn.getAttribute('aria-disabled') !== 'true') {
                    incBtn.click();
                    await sleep(CLICK_DELAY_MS);
                    dispatchInputAndChange(inputEl);
                    const finalVal = normalize(inputEl.value || inputEl.getAttribute('value') || '');
                    return (finalVal === '1' || finalVal === '1.0');
                }
            } catch (err) {
                console.warn('[Auto+1] Error clicking increase button', err);
            }
        }

        // fallback: set input directly
        try {
            inputEl.focus();
            inputEl.value = '1';
            inputEl.setAttribute('value', '1');
            dispatchInputAndChange(inputEl);
            const ticketInfo = inputEl.closest('.ticketInfo') || inputEl.parentElement;
            if (ticketInfo) ticketInfo.click();
            await sleep(150);
            const newVal = String(inputEl.value || inputEl.getAttribute('value') || '').trim();
            return (newVal === '1' || newVal === '1.0');
        } catch (err) {
            console.error('[Auto+1] Failed to set input directly', err);
            return false;
        }
    }

    // === Process one event: expand it (strict) and set FREE ticket inputs to 1 ===
    async function processEvent(eventEl) {
        if (!eventEl) return false;

        // expand only via canonical chevron
        await ensureEventExpanded(eventEl);

        // collect inputs
        let inputs = Array.from(eventEl.querySelectorAll('input.ticketTypeQuantity, input[data-testid="seat_quantiy_input"]'));

        // fallback if none found (try some likely candidates)
        if (inputs.length === 0) {
            inputs = Array.from(eventEl.querySelectorAll('input[type="number"], input[type="text"]')).filter(i => {
                const lbl = (i.getAttribute('aria-label') || '').toLowerCase();
                return lbl.includes('ticket') || lbl.includes('quantity') || (i.id && i.id.toLowerCase().includes('seat_quantiy'));
            });
        }

        if (inputs.length === 0) {
            return false;
        }

        let anySucceeded = false;
        for (const input of inputs) {
            // Only set to 1 if that specific ticket row is free
            for (let attempt = 1; attempt <= MAX_TRIES; attempt++) {
                const ok = await trySetInputToOneIfFree(input);
                if (ok) {
                    anySucceeded = true;
                    break;
                }
                await sleep(CLICK_DELAY_MS);
            }
            await sleep(120);
        }

        return anySucceeded;
    }

    // === Utilities to find events and Add to Cart button ===
    function findAllEventElements() {
        const events = Array.from(document.querySelectorAll('.eventsContainer .event, .event'));
        return events.filter(e => e instanceof Element);
    }

    async function clickAddToCart() {
        let btn = document.querySelector('button[data-testid="add_cart_button"]');
        if (!btn) {
            const allButtons = Array.from(document.querySelectorAll('button'));
            btn = allButtons.find(b => (b.textContent || '').trim().toLowerCase().includes('add to cart'));
        }
        if (btn) {
            try {
                btn.focus();
                btn.click();
                console.log('Clicked Add to Cart.');
            } catch (err) {
                console.error('Failed to click Add to Cart', err);
            }
        } else {
            console.warn('Add to Cart button not found.');
        }
    }

    // === Main runner ===
    let running = false;
    async function runAll() {
        if (running) return;
        running = true;
        console.log('Running helper for free tickets...');

        const events = findAllEventElements();
        let any = false;
        for (const ev of events) {
            try {
                const r = await processEvent(ev);
                if (r) any = true;
                await sleep(CLICK_DELAY_MS);
            } catch (err) {
                console.error('Error helper event', err);
            }
        }

        if (any) {
            await sleep(WAIT_AFTER_PROCESS_MS);
            await clickAddToCart();
        } else {
            console.log('No free tickets were found/changed — not clicking Add to Cart.');
        }

        running = false;
    }

    // === MutationObserver to re-run on dynamic changes (keeps behavior but won't run before initial delay) ===
    const observer = new MutationObserver((mutations) => {
        for (const m of mutations) {
            if (m.addedNodes && m.addedNodes.length) {
                for (const node of m.addedNodes) {
                    if (!(node instanceof Element)) continue;
                    if (node.matches && (node.matches('.event') || node.matches('.eventsContainer')) ||
                        (node.querySelector && (node.querySelector('input.ticketTypeQuantity') || node.querySelector('button[data-testid="increase_quantity_button"]') || node.querySelector('button[data-testid="expand_collapse_button"]')))
                    ) {
                        // If not currently running and initial delay passed, run
                        if (!running && window.__autoPlusAndCart_initialized) runAll();
                        return;
                    }
                }
            }
            if (m.type === 'attributes' && m.target instanceof Element && (m.target.matches('button[data-testid="expand_collapse_button"]') || m.attributeName === 'aria-expanded')) {
                if (!running && window.__autoPlusAndCart_initialized) runAll();
                return;
            }
        }
    });

    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style', 'aria-expanded'] });

    // === Start after initial delay ===
    window.addEventListener('load', async () => {
        console.log('Waiting', INITIAL_DELAY_MS / 1000, 'seconds before executing...');
        await sleep(INITIAL_DELAY_MS);
        // mark init so observer-triggered runs will execute
        window.__autoPlusAndCart_initialized = true;
        runAll();
    });

    // manual trigger (useful for testing)
    window.__autoPlusAndCart = runAll;

    console.log('Script loaded: will run after', INITIAL_DELAY_MS / 1000, 'seconds. Use window.__autoPlusAndCart() to run manually.');

})();
