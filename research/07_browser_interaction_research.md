# Browser Automation Deep Technical Research
## DOM-Based vs GUI/Vision-Based vs Hybrid Approaches for Job Application Automation

**Date:** 2026-02-10
**Context:** Automating job applications across LinkedIn, Greenhouse, Workday (Shadow DOM), SmartRecruiters, Lever, and unknown ATS platforms.

---

## Table of Contents

1. [DOM-Based Approach (Traditional)](#1-dom-based-approach-traditional)
2. [GUI/Vision-Based Approach (Computer Vision)](#2-guivision-based-approach-computer-vision)
3. [Hybrid Approach (DOM + Vision)](#3-hybrid-approach-dom--vision)
4. [Specific Hard Problems & Solutions](#4-specific-hard-problems--solutions)
5. [Interaction Levels: Sandbox vs Browser vs OS](#5-interaction-levels-sandbox-vs-browser-vs-os)
6. [Anti-Detection Considerations](#6-anti-detection-considerations)
7. [Comparison Tables](#7-comparison-tables)
8. [Final Recommendations](#8-final-recommendations)

---

## 1. DOM-Based Approach (Traditional)

### 1.1 How Playwright/Puppeteer Interact with DOM

Both Playwright and Puppeteer communicate with Chromium-based browsers through the **Chrome DevTools Protocol (CDP)**. This is a WebSocket-based protocol that exposes browser internals:

- **DOM domain**: Query/modify the DOM tree
- **Runtime domain**: Execute JavaScript in page context
- **Input domain**: Dispatch synthesized keyboard/mouse events
- **Page domain**: Navigation, screenshots, lifecycle events
- **Accessibility domain**: Query the accessibility tree
- **DOMSnapshot domain**: Capture full DOM snapshots with computed styles

When you call `page.click('button')`, Playwright:
1. Resolves the selector to a DOM node via CDP
2. Scrolls the element into view
3. Waits for actionability checks (visible, enabled, stable)
4. Computes the element's center coordinates
5. Dispatches CDP `Input.dispatchMouseEvent` at those coordinates

### 1.2 The Shadow DOM Problem

#### Open Shadow DOM

Playwright's CSS and text locators **pierce open shadow DOM by default**. No special syntax required:

```typescript
// This works even if the input is inside a shadow root
await page.locator('#shadow-host input.my-field').fill('value');

// Text selectors also pierce shadow DOM
await page.getByRole('button', { name: 'Submit' }).click();

// Chained locators work through shadow boundaries
await page.locator('my-component').locator('input').fill('hello');
```

**Key limitation**: XPath does NOT pierce shadow DOM. Always use CSS selectors.

#### Closed Shadow DOM

Both Playwright and Selenium **cannot natively access closed shadow DOM**. This is a fundamental browser security boundary.

**Workaround 1: Monkey-patch `attachShadow` via `addInitScript`**

```typescript
// Force all shadow roots to be open BEFORE page loads
await context.addInitScript(() => {
  Element.prototype._attachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function() {
    return this._attachShadow({ mode: 'open' });
  };
});
```

This is the most widely used workaround. It intercepts shadow root creation before the page's JS runs, forcing `mode: 'open'` regardless of what the component requests. **Caveat**: This may break some components that rely on closed shadow DOM behavior.

**Workaround 2: `page.evaluate` with `shadowRoot` traversal**

```typescript
// Direct JavaScript traversal (only works for open shadow roots)
const value = await page.evaluate(() => {
  const host = document.querySelector('my-component');
  const shadow = host.shadowRoot; // null for closed shadow DOM
  return shadow?.querySelector('input')?.value;
});
```

**Workaround 3: Chrome Extension API (`chrome.dom.openOrClosedShadowRoot`)**

```typescript
// From a Chrome extension content script context:
const host = document.querySelector('my-component');
const shadowRoot = chrome.dom.openOrClosedShadowRoot(host);
const input = shadowRoot.querySelector('input');
```

This is the **only legitimate way to access closed shadow roots** without monkey-patching. It requires running code in an extension's content script context.

**Workaround 4: Patchright (Undetected Playwright Fork)**

Patchright is a patched Playwright that can interact with elements in closed shadow roots using normal locators, and also supports XPath inside closed shadow roots. It achieves this at the browser engine level.

```python
# Patchright - works with closed shadow DOM
from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch()
    page = browser.new_page()
    # Normal locators work through closed shadow DOM
    page.locator('wd-text-input input').fill('value')
```

#### Recursive Shadow DOM Traversal (Manual)

```typescript
// Deep shadow DOM traversal for complex component trees
function queryShadowDom(root: Element | ShadowRoot, selector: string): Element | null {
  // Try direct query first
  const result = root.querySelector(selector);
  if (result) return result;

  // Recursively search through shadow roots
  const elements = root.querySelectorAll('*');
  for (const el of elements) {
    if (el.shadowRoot) {
      const found = queryShadowDom(el.shadowRoot, selector);
      if (found) return found;
    }
  }
  return null;
}

// Usage in page.evaluate
const element = await page.evaluate((sel) => {
  function queryShadowDom(root, selector) {
    const result = root.querySelector(selector);
    if (result) return result;
    for (const el of root.querySelectorAll('*')) {
      if (el.shadowRoot) {
        const found = queryShadowDom(el.shadowRoot, selector);
        if (found) return found;
      }
    }
    return null;
  }
  const el = queryShadowDom(document.body, sel);
  return el ? el.getBoundingClientRect() : null;
}, 'input[data-automation-id="name"]');
```

### 1.3 The iframe Problem

**Same-origin iframes**: Playwright handles these automatically via `page.frameLocator()`:

```typescript
await page.frameLocator('#application-iframe')
  .locator('input[name="email"]')
  .fill('user@example.com');
```

**Cross-origin iframes**: Require explicit frame targeting:

```typescript
// Wait for iframe to load
const frame = page.frame({ url: /greenhouse\.io/ });
await frame.locator('input[name="first_name"]').fill('John');

// Or via frame navigation events
const framePromise = page.waitForEvent('framenavigated',
  frame => frame.url().includes('greenhouse.io'));
await page.goto(jobUrl);
const frame = await framePromise;
```

**Extension-level approach (content scripts)**: Use `all_frames: true` in the manifest:

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["content.js"],
    "all_frames": true,
    "match_about_blank": true
  }]
}
```

This injects your content script into every frame, including cross-origin iframes.

### 1.4 Dynamic Content (React/Vue Virtual DOM)

Modern frameworks use virtual DOM reconciliation that may not trigger standard DOM events:

**Problem**: Setting `.value` directly on a React input doesn't trigger React's synthetic event system.

**Solution**: The `nativeInputValueSetter` trick:

```typescript
function setReactInputValue(element: HTMLInputElement, value: string) {
  // Get the native setter that React's internal fiber tracks
  const nativeInputValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype, 'value'
  )?.set;

  const nativeTextareaValueSetter = Object.getOwnPropertyDescriptor(
    window.HTMLTextAreaElement.prototype, 'value'
  )?.set;

  const setter = element.tagName === 'TEXTAREA'
    ? nativeTextareaValueSetter
    : nativeInputValueSetter;

  // Call native setter to update the actual DOM property
  setter?.call(element, value);

  // Dispatch events that React's event delegation system will catch
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Some frameworks also need blur
  element.dispatchEvent(new Event('blur', { bubbles: true }));
}
```

**For Playwright**: The `fill()` method handles this automatically -- it clears the field and types the value character by character, triggering all relevant events. But if you need to programmatically set a value from `page.evaluate()`, use the pattern above.

**Lazy-loaded content**: Use `IntersectionObserver` detection or scroll-and-wait patterns:

```typescript
// Scroll to trigger lazy loading, then wait for elements
async function scrollAndWait(page, selector, maxScrolls = 10) {
  for (let i = 0; i < maxScrolls; i++) {
    const element = await page.$(selector);
    if (element) return element;
    await page.evaluate(() => window.scrollBy(0, 500));
    await page.waitForTimeout(500);
  }
  return null;
}
```

### 1.5 When Does DOM-Based Break?

| Scenario | Why It Breaks | Mitigation |
|----------|--------------|------------|
| **Canvas-rendered UIs** (e.g., Figma, Google Sheets charts) | No DOM elements to query -- everything is pixels on a `<canvas>` | Vision-based approach or canvas API hooks |
| **Heavy JS obfuscation** | Selectors change on every page load (randomized class names) | Use semantic selectors: `getByRole()`, `getByText()`, `getByLabel()` |
| **Anti-automation DOM changes** | Sites inject honeypot elements or randomize structure | Accessibility tree (stable) > DOM selectors (fragile) |
| **Closed Shadow DOM** | Cannot access internal elements | Monkey-patch `attachShadow`, use extension APIs, or Patchright |
| **WebGL/Three.js UIs** | Rendered in GPU, no DOM representation | OS-level clicking at computed coordinates |
| **PDF viewers embedded in page** | Content inside plugin, not DOM | Download PDF separately, parse with PDF libraries |
| **CAPTCHA challenges** | Intentionally designed to block automation | Third-party CAPTCHA solving services |

---

## 2. GUI/Vision-Based Approach (Computer Vision)

### 2.1 Skyvern

**Architecture**: Planner -> Actor -> Validator

Skyvern uses a **three-component brain** split:
- **Planner**: Holds the high-level goal ("Fill out this job application")
- **Actor**: Executes the immediate step ("Click the 'First Name' field and type 'John'")
- **Validator**: Examines screenshot after action to verify it worked; retries if not

**How it reads the web**:
1. Takes a screenshot of the page
2. Draws bounding boxes around each interactable element (found via DOM analysis)
3. Each element gets a unique numeric ID visible in both the DOM list and the screenshot
4. Sends both the annotated screenshot AND a structured element list to a Vision LLM
5. The LLM correlates visual regions with DOM elements to generate precise actions

**Key insight**: Skyvern is actually a **hybrid** -- it uses DOM analysis to find interactable elements and their bounding boxes, then uses vision LLMs to understand context and decide actions. The vision component handles semantic understanding; the DOM handles precise interaction.

### 2.2 OmniParser (Microsoft)

OmniParser is a **screen parsing tool** for pure vision-based GUI agents:

- Takes a screenshot as input
- Outputs structured elements with bounding boxes, labels, and interaction types
- Uses specialized detection models to find UI elements (buttons, inputs, links, text)
- OmniParser V2 (Feb 2025) achieves 39.5% on ScreenSpot Pro grounding benchmark
- Works with any LLM: GPT-4o, Claude, Gemini, DeepSeek, Qwen

**Usage pattern**:
```
Screenshot -> OmniParser -> [list of {element, bbox, type, label}] -> LLM decides action -> Execute click/type at bbox coordinates
```

**Strength**: Completely DOM-independent. Works on any UI including desktop apps, canvas, WebGL.
**Weakness**: No direct element handle -- must click by coordinates, which is less precise.

### 2.3 SeeAct (GPT-4V Web Agent)

SeeAct operates in two stages:
1. **Action Generation**: Vision LLM looks at screenshot and generates textual plan ("Click the email input field")
2. **Action Grounding**: Maps the textual plan to actual HTML elements using one of three strategies:
   - Grounding via Element Attributes (HTML-based)
   - Grounding via Textual Choices (multiple choice from visible text)
   - Grounding via Image Annotation (Set-of-Mark overlays)

**Key finding**: GPT-4V can successfully complete **51.1%** of tasks on live websites *if manually grounded* (i.e., the human handles element selection). The main bottleneck is **grounding accuracy**, not understanding.

**Best grounding strategy**: Hybrid -- uses BOTH HTML structure AND visuals. Pure vision grounding (including Set-of-Mark) was found to be less effective for web agents specifically.

### 2.4 Set-of-Mark (SoM) Prompting

**How it works**:
1. Segment the screenshot into interactive regions (using SAM or similar)
2. Overlay numbered markers (alphanumerics, colored boxes) on each region
3. Send the annotated image to GPT-4V/Claude
4. Model responds with the marker number to click

**For web automation specifically**: SoM is less effective than hybrid grounding because:
- Dense web UIs create overlapping/cluttered markers
- Small clickable elements (24px buttons) get obscured by marker labels
- Grid must be extremely dense to reliably mark all interactive elements

**Where SoM excels**: Desktop applications with larger, more spaced-out UI elements.

### 2.5 Anthropic Computer Use

Claude's native computer control operates at the **OS level**:
- Takes screenshots of the entire screen
- Counts pixels from screen edges to calculate exact cursor positions
- Controls mouse movement, clicking, and keyboard typing
- Works across any application (not just browsers)

**Architecture**: Virtual X11 display (Xvfb) -> Screenshot capture -> Claude vision analysis -> Mouse/keyboard commands

**Performance trajectory**:
- Late 2024: ~15% success on OSWorld benchmark
- Late 2025 (Claude 4 / Sonnet 4.5): ~high 80s% for standard office tasks

**Trade-offs**:
- **Pro**: Works on anything visible on screen (canvas, desktop apps, closed shadow DOM)
- **Pro**: Undetectable by web-based bot detection (OS-level input)
- **Con**: Slow (screenshot -> LLM inference -> action per step)
- **Con**: Expensive (each step costs an LLM API call with image)
- **Con**: Pixel-precision can fail with screen resolution changes

### 2.6 Vision Model Comparison for UI Understanding (Late 2025)

| Model | MMMU Score | UI Understanding Strength | Best For |
|-------|-----------|--------------------------|----------|
| **Gemini 3 Pro** | ~83% | #1 on LMArena Vision leaderboard | Screenshot analysis, layout understanding, chart/dashboard parsing |
| **GPT-5.1** | 84.2% | Strong multimodal, large context window | General vision tasks, OCR |
| **Claude 4.5 Sonnet** | 77.8% | Strong practical analysis, code screenshots | Code-related UI, diagram understanding |
| **Gemini 2.5 Pro** | ~80% | #2 on LMArena Vision | Spatial reasoning, element relationship understanding |

**For web automation specifically**: Gemini 3 Pro currently leads in pure visual UI understanding. Claude is preferred when the task involves reasoning about code/structure alongside visuals. GPT-4o/5.1 offers the best balance of vision quality and availability.

### 2.7 OCR Libraries for Text Extraction

| Library | Speed | Accuracy | Language Support | GPU Required |
|---------|-------|----------|-----------------|--------------|
| **pytesseract** | Slow | Moderate | 100+ languages | No |
| **EasyOCR** | Moderate | Good | 80+ languages | Optional |
| **PaddleOCR** | Fast | Excellent | 80+ languages | Optional |
| **Surya OCR** | Fast | Excellent | 90+ languages | Yes |

For web automation, OCR is rarely needed since DOM text extraction is more reliable. Vision LLMs now handle text recognition better than dedicated OCR for UI contexts.

---

## 3. Hybrid Approach (DOM + Vision)

### 3.1 Browser-Use's Approach

Browser-Use (the leading open-source AI browser automation library) uses a sophisticated hybrid:

**Architecture** (post-CDP migration):
```
CDP Connection -> DOMSnapshot.captureSnapshot()
                  + Accessibility.getFullAXTree()
                  + Page.captureScreenshot()
                  -> DomService processes all three
                  -> Builds EnhancedDOMTreeNode with:
                     - DOM node data (tag, attributes, computed styles)
                     - Accessibility node data (role, name, description)
                     - Bounding box (from layout snapshot)
                     - Visibility flags
                     - Clickable element detection
                  -> Serialized into text representation for LLM
                  -> Screenshot sent alongside for visual context
```

**Key components**:
- `DomService` (`browser_use/dom/service.py`): Orchestrates DOM extraction
- `ClickableElementDetector`: Identifies interactive elements via heuristics
- `DOMWatchdog`: Monitors DOM changes via event bus
- Uses `cdp-use` library for typed CDP access (raw WebSocket, not Playwright)

**Why they dropped Playwright for raw CDP**:
- 5x faster element extraction
- Proper cross-origin iframe support
- Real-time DOM state updates (not just between actions)
- Async reaction capabilities
- Playwright's abstractions were "hiding the true complexity" and blocking solutions to the harder half of automation challenges

**What the LLM receives**:
1. A text representation of the accessibility tree with indexed interactive elements
2. A screenshot (optionally with highlighted element bounding boxes)
3. The LLM decides which indexed element to interact with and what action to take

### 3.2 Stagehand's Approach

Stagehand (by Browserbase) uses a three-primitive model:

```typescript
// Observe: Preview what AI would do (returns selectors)
const [action] = await stagehand.observe("click the login button");
// Returns: { selector: "xpath=/html[1]/body[1]/div[1]/button[1]",
//            description: "Login button", method: "click" }

// Act: Execute an action with natural language
await stagehand.act("click the login button");
// Or execute a previously observed action:
await stagehand.act(action);

// Extract: Get structured data with Zod schema validation
const data = await stagehand.extract(
  "extract the job title and company",
  z.object({ title: z.string(), company: z.string() })
);
```

**Caching mechanism**:
```typescript
const stagehand = new Stagehand({
  cacheDir: './stagehand-cache',
  // Cache key = hash(instruction + startURL + config)
});

// First run: LLM inference -> cache result
await stagehand.act("click submit"); // ~2s (LLM call)

// Subsequent runs: replay from cache
await stagehand.act("click submit"); // ~50ms (no LLM call)

// Self-healing: if cached selector fails, re-invokes LLM
```

The caching pattern is: **observe -> validate -> cache -> deterministic replay -> self-heal when broken**.

### 3.3 The Optimal Hybrid Strategy

```
                    ┌─────────────────────────┐
                    │   Known Platform?        │
                    │   (LinkedIn, Greenhouse) │
                    └────────┬────────────────┘
                             │
                    ┌────────┴────────┐
                    │ YES             │ NO
                    ▼                 ▼
            ┌──────────────┐  ┌──────────────────┐
            │ DOM-First    │  │ Vision-First      │
            │ Approach     │  │ Approach           │
            │              │  │                    │
            │ - Hardcoded  │  │ - Screenshot       │
            │   selectors  │  │ - LLM identifies   │
            │ - Platform   │  │   form fields      │
            │   adapters   │  │ - Maps to DOM for   │
            │ - Fast, cheap│  │   interaction       │
            │ - Cached     │  │ - Fallback to coord │
            │              │  │   click if needed   │
            └──────────────┘  └──────────────────┘
                    │                 │
                    └────────┬────────┘
                             │
                    ┌────────┴────────┐
                    │ Action Failed?  │
                    └────────┬────────┘
                             │ YES
                             ▼
                    ┌──────────────────┐
                    │ Vision Fallback  │
                    │ - Take screenshot│
                    │ - LLM locates el │
                    │ - Coordinate     │
                    │   click          │
                    └──────────────────┘
```

**The key insight**: Use vision to LOCATE an element, then use DOM to CLICK it:

```typescript
async function hybridInteract(page, naturalLanguageTarget: string) {
  // Step 1: Take screenshot and ask LLM to identify the element
  const screenshot = await page.screenshot({ type: 'png' });
  const llmResponse = await askVisionLLM(screenshot,
    `Find the element: "${naturalLanguageTarget}".
     Return its approximate x,y coordinates and any visible text/label.`
  );

  // Step 2: Use the LLM's description to find the DOM element
  const { x, y, text } = llmResponse;

  // Try DOM-based matching first (more reliable click)
  const element = await page.locator(`text="${text}"`).first();
  if (await element.isVisible()) {
    await element.click();
    return;
  }

  // Fallback: Use elementFromPoint to get DOM element at coordinates
  const domElement = await page.evaluate(({ x, y }) => {
    const el = document.elementFromPoint(x, y);
    return el ? { tag: el.tagName, id: el.id, class: el.className } : null;
  }, { x, y });

  // Fallback: Click at coordinates directly
  if (!domElement) {
    await page.mouse.click(x, y);
  }
}
```

---

## 4. Specific Hard Problems & Solutions

### 4.1 Workday Shadow DOM

Workday uses custom web components (`wd-*` prefix) extensively with shadow DOM encapsulation.

**Approach 1: Playwright CSS piercing (works for open shadow DOM)**

```typescript
// Playwright pierces open shadow DOM automatically
await page.locator('[data-automation-id="name"] input').fill('John Doe');
await page.locator('[data-automation-id="email"] input').fill('john@example.com');

// For Workday's custom components
await page.locator('wd-text-input').locator('input').fill('value');
await page.locator('wd-popup').locator('[role="option"]').first().click();
```

**Approach 2: Force open shadow roots (for closed shadow DOM)**

```typescript
// Add this BEFORE navigating to the Workday page
await page.addInitScript(() => {
  const origAttachShadow = Element.prototype.attachShadow;
  Element.prototype.attachShadow = function(init) {
    return origAttachShadow.call(this, { ...init, mode: 'open' });
  };
});

await page.goto('https://company.wd5.myworkdayjobs.com/...');
// Now all shadow roots are open and queryable
await page.locator('wd-text-input input').fill('value');
```

**Approach 3: page.evaluate for complex Workday interactions**

```typescript
// Some Workday components need JS-level interaction
await page.evaluate(() => {
  // Traverse shadow DOM manually
  function findInShadow(selector) {
    const hosts = document.querySelectorAll('*');
    for (const host of hosts) {
      if (host.shadowRoot) {
        const found = host.shadowRoot.querySelector(selector);
        if (found) return found;
      }
    }
    return null;
  }

  const input = findInShadow('input[data-automation-id="legalNameSection_firstName"]');
  if (input) {
    input.value = 'John';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  }
});
```

**Approach 4: Extension-level (recommended for our system)**

```typescript
// In content script, use chrome.dom API for closed shadow roots
function queryWorkdayElement(selector: string): Element | null {
  const hosts = document.querySelectorAll('*');
  for (const host of hosts) {
    // chrome.dom.openOrClosedShadowRoot works for BOTH open and closed
    const shadowRoot = chrome.dom.openOrClosedShadowRoot(host);
    if (shadowRoot) {
      const found = shadowRoot.querySelector(selector);
      if (found) return found;
    }
  }
  return null;
}

// Usage
const firstNameInput = queryWorkdayElement(
  'input[data-automation-id="legalNameSection_firstName"]'
);
```

### 4.2 Google Places Autocomplete (SmartRecruiters Location Fields)

```typescript
async function fillLocationField(page, selector: string, location: string) {
  const input = page.locator(selector);

  // Step 1: Focus and clear
  await input.click();
  await input.fill('');

  // Step 2: Type slowly to trigger autocomplete
  // Must type character by character with delays
  for (const char of location) {
    await input.type(char, { delay: 100 });
  }

  // Step 3: Wait for the Google Places dropdown to appear
  // The dropdown is typically a .pac-container or similar
  await page.waitForSelector('.pac-container .pac-item', {
    state: 'visible',
    timeout: 5000
  });

  // Step 4: Wait a beat for all suggestions to load
  await page.waitForTimeout(500);

  // Step 5: Click the first (best) match
  const firstSuggestion = page.locator('.pac-container .pac-item').first();
  await firstSuggestion.click();

  // Step 6: Verify the input was populated
  await page.waitForFunction(
    (sel) => {
      const el = document.querySelector(sel) as HTMLInputElement;
      return el && el.value.length > 0;
    },
    selector,
    { timeout: 3000 }
  );
}

// CRITICAL: You cannot just set the value. The autocomplete widget
// validates that a selection was made from the dropdown.
// The Places API generates a session token and the selection must
// come from a real dropdown interaction.
```

### 4.3 Custom Dropdown/Typeahead Components

#### React Select

```typescript
async function selectReactSelectOption(page, containerSelector: string, optionText: string) {
  // React Select renders a control div, not a native <select>
  const container = page.locator(containerSelector);

  // Click the control to open the dropdown
  await container.locator('.react-select__control, [class*="control"]').click();

  // Wait for the menu (rendered as a portal, often outside the component)
  await page.waitForSelector('[class*="menu"]', { state: 'visible' });

  // Type to filter if needed
  const input = container.locator('input');
  if (await input.count() > 0) {
    await input.fill(optionText);
    await page.waitForTimeout(300); // Wait for filtering
  }

  // Click the matching option
  await page.locator(`[class*="option"]`).filter({ hasText: optionText }).first().click();
}
```

#### Ant Design Select

```typescript
async function selectAntdOption(page, selectSelector: string, optionText: string) {
  // Ant Design Select v4+ renders dropdown as a portal outside the component
  const select = page.locator(selectSelector);

  // Click to open (Ant Design uses a specific selector wrapper)
  await select.locator('.ant-select-selector').click();

  // The dropdown is rendered in a separate div at document root
  await page.waitForSelector('.ant-select-dropdown', { state: 'visible' });

  // Type into the search if the select supports search
  const searchInput = page.locator('.ant-select-dropdown .ant-select-search__field, input.ant-select-selection-search-input');
  if (await searchInput.count() > 0) {
    await searchInput.fill(optionText);
    await page.waitForTimeout(300);
  }

  // Click the option - options are in .ant-select-item-option
  await page.locator('.ant-select-item-option')
    .filter({ hasText: optionText })
    .first()
    .click();
}
```

#### Material UI Autocomplete

```typescript
async function selectMUIAutocomplete(page, inputSelector: string, optionText: string) {
  const input = page.locator(inputSelector);

  // Click to focus
  await input.click();

  // Type to trigger suggestions
  await input.fill(optionText);

  // Wait for the listbox to appear (MUI uses role="listbox")
  await page.waitForSelector('[role="listbox"]', { state: 'visible' });
  await page.waitForTimeout(300); // Wait for async options to load

  // Click the matching option
  await page.locator('[role="option"]')
    .filter({ hasText: optionText })
    .first()
    .click();

  // CAUTION: MUI 7.3+ had a regression with Playwright's .fill() + .press("Enter")
  // on freeSolo Autocomplete. Prefer clicking the option over pressing Enter.
}
```

#### Generic Pattern (works for most custom dropdowns)

```typescript
async function selectFromCustomDropdown(
  page,
  triggerSelector: string,
  optionText: string,
  dropdownSelector = '[role="listbox"], [role="menu"], .dropdown-menu, .select-dropdown'
) {
  // Step 1: Click trigger to open
  await page.locator(triggerSelector).click();

  // Step 2: Wait for dropdown to appear
  await page.waitForSelector(dropdownSelector, { state: 'visible', timeout: 3000 });

  // Step 3: Try multiple option selectors
  const optionSelectors = [
    `[role="option"]:has-text("${optionText}")`,
    `[role="menuitem"]:has-text("${optionText}")`,
    `li:has-text("${optionText}")`,
    `.option:has-text("${optionText}")`,
  ];

  for (const sel of optionSelectors) {
    const option = page.locator(sel).first();
    if (await option.isVisible({ timeout: 500 }).catch(() => false)) {
      await option.click();
      return;
    }
  }

  throw new Error(`Could not find option "${optionText}" in dropdown`);
}
```

### 4.4 File Upload Behind Styled Buttons

#### Standard Hidden Input

```typescript
// Playwright handles hidden inputs directly
await page.locator('input[type="file"]').setInputFiles('/path/to/resume.pdf');
// Works even if the input is hidden (display:none, visibility:hidden, etc.)
```

#### Dropzone.js (used by Greenhouse)

```typescript
// Approach 1: Target Dropzone's hidden input
await page.locator('.dz-hidden-input, input[type="file"][style*="visibility: hidden"]')
  .setInputFiles('/path/to/resume.pdf');

// Approach 2: Use FileChooser event (for dynamically created inputs)
const fileChooserPromise = page.waitForEvent('filechooser');
await page.locator('.dropzone, [data-dropzone]').click();
const fileChooser = await fileChooserPromise;
await fileChooser.setFiles('/path/to/resume.pdf');

// Approach 3: Programmatic Dropzone interaction
await page.evaluate(async (filePath) => {
  const dropzone = Dropzone.instances[0]; // or document.querySelector('.dropzone').dropzone
  const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });
  dropzone.addFile(file);
}, filePath);
```

#### Extension Content Script Approach

```typescript
// From content script, trigger file input directly
function triggerFileUpload(inputSelector: string, fileData: ArrayBuffer, fileName: string) {
  const input = document.querySelector(inputSelector) as HTMLInputElement;
  if (!input) return;

  const file = new File([fileData], fileName, { type: 'application/pdf' });
  const dataTransfer = new DataTransfer();
  dataTransfer.items.add(file);
  input.files = dataTransfer.files;

  // Trigger events
  input.dispatchEvent(new Event('change', { bubbles: true }));
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
```

### 4.5 Form Validation on Blur/Change Events

```typescript
// Complete event sequence for React/Vue/Angular inputs
async function fillFormField(page, selector: string, value: string) {
  const input = page.locator(selector);

  // Option 1: Use Playwright's fill() -- handles most cases
  await input.fill(value);

  // Option 2: If fill() doesn't trigger validation, use full event sequence
  await input.click(); // focus
  await input.fill(''); // clear

  // Type character by character (triggers input events)
  await input.type(value, { delay: 50 });

  // Explicitly trigger blur (fires validation in many frameworks)
  await input.evaluate(el => {
    el.dispatchEvent(new Event('blur', { bubbles: true }));
    el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
  });

  // Wait for any validation to complete
  await page.waitForTimeout(100);
}

// For content scripts (no Playwright):
function fillFieldWithEvents(element: HTMLInputElement, value: string) {
  // Focus
  element.focus();
  element.dispatchEvent(new FocusEvent('focus', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusin', { bubbles: true }));

  // Set value using native setter (React-compatible)
  const setter = Object.getOwnPropertyDescriptor(
    HTMLInputElement.prototype, 'value'
  )?.set;
  setter?.call(element, value);

  // Input event
  element.dispatchEvent(new InputEvent('input', {
    bubbles: true,
    inputType: 'insertText',
    data: value
  }));

  // Change event
  element.dispatchEvent(new Event('change', { bubbles: true }));

  // Blur (triggers validation)
  element.dispatchEvent(new FocusEvent('blur', { bubbles: true }));
  element.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
}
```

---

## 5. Interaction Levels: Sandbox vs Browser vs OS

### 5.1 Comparison Matrix

| Level | Mechanism | Speed | Stealth | Reliability | Cross-Platform | Shadow DOM | iframes |
|-------|-----------|-------|---------|-------------|----------------|------------|---------|
| **Browser CDP** | Chrome DevTools Protocol WebSocket | Very Fast | Low (detectable) | High | Chromium only | Open only | With effort |
| **Extension Content Script** | Injected JS in page context | Fast | High (native) | High | Chromium | Open + Closed* | all_frames |
| **Playwright/Puppeteer** | CDP abstraction layer | Fast | Low (detectable) | Very High | Multi-browser | Open only | Built-in |
| **Patchright** | Patched Playwright (stealth) | Fast | High | Very High | Chromium | Open + Closed | Built-in |
| **OS-Level (PyAutoGUI)** | Native OS input events | Slow | Very High | Low | All | N/A (visual) | N/A |
| **OS-Level (xdotool)** | X11 input simulation | Slow | Very High | Low | Linux only | N/A (visual) | N/A |
| **Accessibility Tree** | CDP Accessibility domain | Moderate | Moderate | High | Chromium | Pierces all | Built-in |

\* *Using `chrome.dom.openOrClosedShadowRoot`*

### 5.2 When to Use Each Level

**Browser-level (CDP/Playwright)**:
- Best for: Orchestration, navigation, page lifecycle management, screenshots
- When: You control the browser instance and detection is not a concern (test environments)
- Avoid when: The target site actively detects automation

**Extension-level (Content Script)**:
- Best for: Interacting with elements in existing user sessions, stealth operation
- When: User installs your extension and grants permissions; you need access to their logged-in sessions
- Key advantage: Appears as legitimate user activity; no CDP detection vectors
- Key advantage: `chrome.dom.openOrClosedShadowRoot` for closed shadow DOM
- Limitation: Cannot automate browser chrome (address bar, extensions page)

**OS-level (PyAutoGUI/xdotool)**:
- Best for: Bypassing all web-level bot detection; interacting with canvas/WebGL UIs
- When: All other approaches are detected or the UI has no DOM representation
- Trade-off: Slow, fragile (depends on screen resolution/position), hard to debug

**Accessibility Tree**:
- Best for: AI agents that need structured page understanding without full DOM parsing
- When: Building LLM-driven automation that needs semantic element identification
- How: CDP `Accessibility.getFullAXTree()` returns roles, names, descriptions, states
- Key advantage: Stable across UI redesigns (semantic meaning doesn't change even if CSS does)

### 5.3 The Cordyceps Approach (Extension + Playwright API without CDP)

A notable new project: **Cordyceps** runs Playwright/Puppeteer client APIs entirely inside a Chrome extension using standard DOM APIs -- no CDP required. It includes:

- `snapshotForAI()` for structured accessibility snapshots
- Seamless shadow DOM and iframe traversal (using extension APIs)
- No CDP detection vectors
- All the Playwright API ergonomics without the Playwright server

This represents a promising direction for our system: extension-level execution with high-level API ergonomics.

---

## 6. Anti-Detection Considerations

### 6.1 CDP Detection Vectors

| Detection Signal | Description | Status (2025) |
|-----------------|-------------|---------------|
| `navigator.webdriver` | Set to `true` when CDP is active | Can be patched with `--disable-blink-features=AutomationControlled` |
| `Runtime.enable` side effects | Triggering V8 side effects when inspecting error stacks | **Broken** -- V8 no longer triggers these side effects |
| `__playwright__binding__` | Playwright injects binding into window | Detectable; use Patchright to avoid |
| `__pwInitScripts` | Playwright's initialization scripts | Detectable; use Patchright to avoid |
| CDP port open | Checking if debug port accepts connections | Can be detected; use random ports |
| `window.cdc_adoQpoasnfa76pfcZLmcfl_Array` | ChromeDriver C++ bindings leak | Use undetected-chromedriver |
| Canvas/WebGL fingerprint inconsistencies | Headless mode renders differently | Use headful mode |
| Behavioral analysis | Inhuman click patterns, speed | Add random delays, human-like mouse movement |

### 6.2 Anti-Detection Strategies

**Level 1: Patched Playwright (Patchright)**
```python
# Patchright avoids Runtime.enable by using isolated execution contexts
from patchright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(
        channel='chrome',  # Real Chrome, not Chromium
        headless=False,     # Headful mode
    )
```

**Level 2: CDP-Minimal Frameworks (Nodriver/Selenium-Driverless)**
- Abandon traditional WebDriver architecture entirely
- Communicate with browser through minimal CDP usage
- Emulate user behavior through more stealthy control mechanisms
- Nodriver/Zendriver successfully bypass 3 out of 4 major anti-bot systems

**Level 3: Extension-Based (Our Current Approach)**
- Content scripts are native browser code
- No CDP connection needed for DOM interaction
- Extension APIs provide legitimate access to page content
- User's real browser fingerprint is preserved
- **This is the most stealth approach for web automation**

**Level 4: OS-Level (Maximum Stealth)**
```python
# For the most sensitive interactions
import pyautogui

# Real OS-level mouse events -- completely undetectable by web code
pyautogui.moveTo(500, 300, duration=0.3)  # Human-like movement
pyautogui.click()
pyautogui.typewrite('John Doe', interval=0.05)  # Human-like typing
```

### 6.3 Best Practice Strategy

```
For LinkedIn:     Extension content script (already logged in, no detection risk)
For Workday:      Patchright (need shadow DOM + stealth) OR Extension with chrome.dom API
For Greenhouse:   Extension or Playwright (standard DOM, low detection)
For Unknown ATS:  Start with extension; fall back to Patchright; fall back to OS-level
```

---

## 7. Comparison Tables

### 7.1 Approach Comparison

| Criteria | DOM-Only | Vision-Only | Hybrid (DOM + Vision) |
|----------|----------|-------------|----------------------|
| **Speed** | Very Fast | Very Slow (LLM inference) | Fast (DOM default, vision fallback) |
| **Cost** | Free | $$$$ (LLM API calls per step) | $ (LLM only when needed) |
| **Reliability on known pages** | Very High | Moderate | Very High |
| **Reliability on unknown pages** | Low (selectors break) | Moderate | High |
| **Shadow DOM support** | Partial (open only) | Full (sees everything on screen) | Full |
| **Canvas/WebGL UIs** | Cannot interact | Full support | Full support |
| **Maintenance burden** | High (selectors break on redesign) | Low (visually adaptive) | Moderate |
| **Anti-detection** | Depends on execution level | High (OS-level) | Depends on execution level |
| **Setup complexity** | Low | High | Moderate |

### 7.2 Tool/Framework Comparison

| Tool | Approach | Shadow DOM | Anti-Detection | Cost | Best For |
|------|----------|-----------|----------------|------|----------|
| **Playwright** | DOM/CDP | Open only | Low | Free | Testing, known pages |
| **Patchright** | DOM/CDP (patched) | Open + Closed | High | Free | Stealth automation |
| **Browser-Use** | Hybrid (CDP + Vision) | Open (via a11y tree) | Low | LLM costs | AI agents, unknown pages |
| **Stagehand** | Hybrid (DOM + LLM) | Via Playwright | Low | LLM costs | Production automation with caching |
| **Skyvern** | Hybrid (DOM + Vision) | Via screenshots | Moderate | LLM costs | No-code automation |
| **Anthropic Computer Use** | Pure Vision/OS | N/A (sees screen) | Very High | LLM costs | Desktop automation |
| **Chrome Extension** | DOM (content script) | Open + Closed* | Very High | Free | In-browser automation |
| **Nodriver** | CDP-minimal | Open only | High | Free | Stealth scraping |

### 7.3 ATS Platform Challenges

| Platform | Main Challenge | Recommended Approach |
|----------|---------------|---------------------|
| **LinkedIn Easy Apply** | Dynamic React forms, modal flow, rate limiting | Extension content script + DOM selectors + human-like delays |
| **Workday** | Shadow DOM (wd-* components), complex multi-step forms | Patchright (closed shadow DOM) or Extension + chrome.dom API |
| **Greenhouse** | Dropzone.js file upload, standard HTML forms in iframes | Playwright frameLocator + setInputFiles |
| **Lever** | Standard HTML forms, some React components | Playwright or Extension |
| **SmartRecruiters** | Google Places autocomplete for location, custom dropdowns | Character-by-character typing + dropdown selection |
| **iCIMS** | iframes, session management | Frame targeting + cookie handling |
| **Taleo** | Legacy Java-based UI, non-standard events | page.evaluate with custom event dispatching |
| **Unknown ATS** | Structure unknown until runtime | Hybrid: Vision LLM identifies form -> DOM fills it |

---

## 8. Final Recommendations

### 8.1 Architecture Recommendation

Given that this system is a **Chrome extension** that already runs as a content script on LinkedIn, the recommended architecture is:

```
┌─────────────────────────────────────────────────────┐
│                  Chrome Extension                     │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Content Script Layer                    │ │
│  │  - Injected into all frames (all_frames: true)   │ │
│  │  - Direct DOM access (fast, stealthy)            │ │
│  │  - chrome.dom.openOrClosedShadowRoot for Workday │ │
│  │  - nativeInputValueSetter for React forms        │ │
│  │  - Full event simulation (focus/input/change/blur)│ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Platform Adapter Layer                  │ │
│  │  - LinkedIn adapter (selectors, modal flow)      │ │
│  │  - Workday adapter (shadow DOM traversal)        │ │
│  │  - Greenhouse adapter (iframe + Dropzone)        │ │
│  │  - Generic adapter (accessibility tree + LLM)    │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │         Vision/LLM Fallback Layer                │ │
│  │  - Screenshot capture via chrome.tabs API        │ │
│  │  - Send to server for LLM analysis               │ │
│  │  - LLM identifies form fields + returns coords   │ │
│  │  - Map coordinates to DOM elements               │ │
│  │  - Only invoked when platform adapter fails      │ │
│  └─────────────────────────────────────────────────┘ │
│                                                       │
│  ┌─────────────────────────────────────────────────┐ │
│  │           Caching Layer (Stagehand-style)        │ │
│  │  - Cache successful selector -> action mappings  │ │
│  │  - Hash by (URL pattern + page structure)        │ │
│  │  - Self-heal: if cached selector fails, re-run   │ │
│  │    LLM analysis and update cache                 │ │
│  └─────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────┘
```

### 8.2 Per-Platform Recommendations

#### LinkedIn Easy Apply
**Approach**: Extension Content Script (DOM-first)

**Why**:
- The extension already runs on LinkedIn with user's logged-in session
- LinkedIn's DOM is well-structured with stable `data-test-*` attributes
- Content script is invisible to LinkedIn's bot detection
- Modal flow (Easy Apply wizard) is DOM-accessible

**Key techniques**:
- Use `MutationObserver` to detect modal page transitions
- Use `querySelector` with `data-test-*` selectors for form fields
- Use `nativeInputValueSetter` for React inputs
- Add human-like random delays (3-7 seconds between actions)
- Respect rate limits (20-25 connections/day max)

```typescript
// LinkedIn-specific form filling
const selectors = {
  firstNameInput: 'input[id*="firstName"], input[name="firstName"]',
  lastNameInput: 'input[id*="lastName"], input[name="lastName"]',
  emailInput: 'input[id*="email"], input[name="email"]',
  phoneInput: 'input[id*="phone"], input[name="phone"]',
  resumeUpload: 'input[type="file"]',
  nextButton: 'button[aria-label="Continue to next step"]',
  submitButton: 'button[aria-label="Submit application"]',
  easyApplyButton: 'button.jobs-apply-button',
};
```

#### Workday Shadow DOM
**Approach**: Extension Content Script with `chrome.dom` API OR Patchright

**Why**:
- Workday uses closed shadow DOM with `wd-*` custom elements
- `chrome.dom.openOrClosedShadowRoot` is the most reliable way to pierce closed shadow roots
- Alternative: Patchright if running outside extension context

**Key techniques**:
- Recursive shadow DOM traversal using `chrome.dom.openOrClosedShadowRoot`
- Use `data-automation-id` attributes (Workday's stable test attributes)
- Handle multi-page wizard flow with explicit waits between steps
- File upload through Workday's custom upload component

```typescript
// Workday-specific shadow DOM traversal
function queryWorkday(automationId: string): HTMLElement | null {
  function searchShadowRoots(root: Element | Document): HTMLElement | null {
    // Direct query first
    const direct = root.querySelector(`[data-automation-id="${automationId}"]`);
    if (direct) return direct as HTMLElement;

    // Search through all shadow roots
    for (const el of root.querySelectorAll('*')) {
      const shadow = (el as any).shadowRoot || chrome.dom?.openOrClosedShadowRoot(el);
      if (shadow) {
        const found = searchShadowRoots(shadow);
        if (found) return found;
      }
    }
    return null;
  }
  return searchShadowRoots(document);
}
```

#### Greenhouse
**Approach**: Extension Content Script (DOM-first, iframe-aware)

**Why**:
- Greenhouse uses standard HTML forms, often inside iframes
- Dropzone.js for file uploads (well-documented interaction pattern)
- Content script with `all_frames: true` handles cross-origin iframes

**Key techniques**:
- Set `all_frames: true` and `match_about_blank: true` in manifest
- Target Dropzone's `.dz-hidden-input` for file uploads
- Handle Google Places autocomplete for location fields (character-by-character typing)

#### Unknown/Generic ATS Platforms
**Approach**: Hybrid (DOM + Vision LLM Fallback)

**Why**:
- Cannot pre-build selectors for unknown platforms
- Need LLM to understand form structure semantically
- Once understood, cache the mapping for reuse

**Strategy**:
1. Take screenshot of the page
2. Send to Vision LLM (Gemini 3 Pro for best UI understanding, or Claude for code-context reasoning)
3. LLM returns structured form field identification: `[{label: "First Name", type: "text", approximate_position: {x, y}}]`
4. For each field, use `document.elementFromPoint(x, y)` to get the actual DOM element
5. Fill using the appropriate technique (direct value, nativeInputValueSetter, etc.)
6. Cache the URL pattern -> field mapping for future use
7. On subsequent visits, try cached selectors first; re-invoke LLM only if they fail

```typescript
// Generic form filler with vision fallback
async function fillUnknownForm(page, formData: Record<string, string>) {
  // Step 1: Try accessibility tree first (fast, no LLM cost)
  const a11yTree = await getAccessibilityTree(page);
  const formFields = identifyFormFieldsFromA11y(a11yTree);

  if (formFields.length > 0) {
    // Accessibility tree gave us enough info
    for (const field of formFields) {
      await fillField(page, field, formData);
    }
    return;
  }

  // Step 2: Fall back to vision LLM
  const screenshot = await page.screenshot();
  const fieldMapping = await visionLLM.analyze(screenshot,
    "Identify all form fields, their labels, types, and positions"
  );

  for (const field of fieldMapping) {
    const element = await page.evaluate(
      ({x, y}) => document.elementFromPoint(x, y),
      field.position
    );
    await fillElement(element, formData[field.label]);
  }

  // Step 3: Cache for next time
  await cacheMapping(page.url(), fieldMapping);
}
```

### 8.3 Cost-Performance Optimization

| Strategy | Cost | Speed | When to Use |
|----------|------|-------|-------------|
| **Hardcoded selectors** | Free | ~50ms/field | Known platforms (LinkedIn, Greenhouse) |
| **Cached LLM mappings** | Free (after first run) | ~50ms/field | Revisiting previously analyzed pages |
| **Accessibility tree analysis** | Free | ~200ms/page | First visit, forms with good a11y |
| **Vision LLM analysis** | ~$0.01-0.05/page | ~2-5s/page | Unknown forms with poor a11y |
| **Full vision agent** | ~$0.10-0.50/page | ~30-60s/page | Complex multi-step flows on unknown sites |

### 8.4 Summary Decision Matrix

```
Q: Is this a known ATS platform?
├── YES -> Use platform-specific adapter (DOM selectors)
│   ├── LinkedIn -> Content script, React event handling
│   ├── Workday -> chrome.dom shadow DOM traversal
│   ├── Greenhouse -> iframe frameLocator + Dropzone
│   └── SmartRecruiters -> Places autocomplete handling
│
└── NO -> Hybrid approach
    ├── Step 1: Try accessibility tree (free, fast)
    ├── Step 2: Try cached mapping from previous visit
    ├── Step 3: Vision LLM to identify form fields
    ├── Step 4: Map LLM results to DOM elements
    └── Step 5: Cache mapping for future visits
```

---

## Appendix A: Key GitHub Repositories

| Repository | Stars | Description |
|-----------|-------|-------------|
| [browser-use/browser-use](https://github.com/browser-use/browser-use) | 60k+ | AI browser automation with CDP + accessibility tree |
| [browserbase/stagehand](https://github.com/browserbase/stagehand) | 15k+ | AI browser automation with act/observe/extract + caching |
| [Skyvern-AI/skyvern](https://github.com/Skyvern-AI/skyvern) | 10k+ | Visual web automation with LLM + CV |
| [microsoft/OmniParser](https://github.com/microsoft/OmniParser) | 15k+ | Screenshot to structured UI elements |
| [microsoft/SoM](https://github.com/microsoft/SoM) | 2k+ | Set-of-Mark visual prompting |
| [OSU-NLP-Group/SeeAct](https://github.com/OSU-NLP-Group/SeeAct) | 1k+ | GPT-4V web agent with grounding |
| [Kaliiiiiiiiii-Vinyzu/patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright) | 5k+ | Undetected Playwright fork (closed shadow DOM support) |
| [adam-s/cordyceps](https://github.com/adam-s/cordyceps) | New | Playwright API in Chrome extension without CDP |
| [webdriverio/query-selector-shadow-dom](https://github.com/webdriverio/query-selector-shadow-dom) | 1k+ | querySelector that pierces shadow DOM |

## Appendix B: Relevant Playwright Issue

- [microsoft/playwright#23047](https://github.com/microsoft/playwright/issues/23047) - Feature request for closed shadow DOM support. Still open. Main workarounds discussed: `addInitScript` monkey-patch, `chrome.dom.openOrClosedShadowRoot`, Patchright.

## Appendix C: Key Blog Posts & Papers

- [Browser-Use: Closer to the Metal -- Leaving Playwright for CDP](https://browser-use.com/posts/playwright-to-cdp)
- [Browserbase: Why Stagehand Is Moving Beyond Playwright](https://www.browserbase.com/blog/stagehand-playwright-evolution-browser-automation)
- [Castle.io: From Puppeteer Stealth to Nodriver](https://blog.castle.io/from-puppeteer-stealth-to-nodriver-how-anti-detect-frameworks-evolved-to-evade-bot-detection/)
- [DataDome: How New Headless Chrome & CDP Signal Impact Bot Detection](https://datadome.co/threat-research/how-new-headless-chrome-the-cdp-signal-are-impacting-bot-detection/)
- [SeeAct Paper (ICML 2024): GPT-4V(ision) is a Generalist Web Agent, if Grounded](https://arxiv.org/abs/2401.01614)
- [OmniParser V2: Turning Any LLM into a Computer Use Agent](https://www.microsoft.com/en-us/research/articles/omniparser-v2-turning-any-llm-into-a-computer-use-agent/)
- [Building Browser Agents: Architecture, Security, and Practical Solutions](https://arxiv.org/pdf/2511.19477)
