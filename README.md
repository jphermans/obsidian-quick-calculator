<!-- markdownlint-disable MD033 MD041 -->
<p align="center">
  <img src="https://img.shields.io/badge/version-1.1.0-blue?style=flat-square" alt="Version">
  <img src="https://img.shields.io/badge/license-MIT-green?style=flat-square" alt="License">
  <img src="https://img.shields.io/badge/obsidian-%3E%3D0.15.0-7c3aed?style=flat-square&logo=obsidian" alt="Obsidian">
  <img src="https://img.shields.io/badge/platform-desktop%20%7C%20mobile-lightgrey?style=flat-square" alt="Platform">
  <img src="https://img.shields.io/badge/built-no%20eval-success?style=flat-square" alt="No eval">
  <img src="https://img.shields.io/badge/parser-recursive%20descent-ff69b4?style=flat-square" alt="Parser">
</p>

<p align="center">
  <img src="banner.png" alt="Quick Calculator — Obsidian Plugin" width="960">
</p>

---

## ✨ Features

<table>
  <tr>
    <td>🖥️ <strong>System launcher</strong></td>
    <td>One-click to open macOS Calculator.app, Windows calc.exe, or your Linux calculator</td>
  </tr>
  <tr>
    <td>📱 <strong>Built-in scientific</strong></td>
    <td>Fully functional calculator modal — works on iOS, Android, and desktop</td>
  </tr>
  <tr>
    <td>🔬 <strong>Scientific mode</strong></td>
    <td>sin · cos · tan · log · ln · √ · x² · xʸ · π · e · n! · abs · floor · ceil · round</td>
  </tr>
  <tr>
    <td>📐 <strong>DEG / RAD toggle</strong></td>
    <td>Switch angle units for trigonometry — one tap</td>
  </tr>
  <tr>
    <td>🔄 <strong>Basic &amp; Scientific</strong></td>
    <td>Toggle modes with the button or <kbd>⌘/Ctrl+M</kbd></td>
  </tr>
  <tr>
    <td>🧠 <strong>Memory</strong></td>
    <td>MC · MR · M+ · M— — persists across Obsidian restarts</td>
  </tr>
  <tr>
    <td>📜 <strong>History</strong></td>
    <td>Last 20 calculations — tap any to reuse</td>
  </tr>
  <tr>
    <td>📝 <strong>Insert into note</strong></td>
    <td>Write the current expression = result into the active Markdown note</td>
  </tr>
  <tr>
    <td>📋 <strong>Copy LaTeX</strong></td>
    <td>Copy as MathJax-ready LaTeX — paste into any note for rendered math</td>
  </tr>
  <tr>
    <td>👁️ <strong>Live LaTeX preview</strong></td>
    <td>See the LaTeX equivalent as you type</td>
  </tr>
  <tr>
    <td>⌨️ <strong>Full keyboard support</strong></td>
    <td>Type expressions — no mouse needed</td>
  </tr>
  <tr>
    <td>🌗 <strong>Theme-aware</strong></td>
    <td>Respects Obsidian light and dark themes</td>
  </tr>
  <tr>
    <td>🛡️ <strong>Safe parser</strong></td>
    <td>Recursive-descent — no <code>eval()</code>, passes community plugin review</td>
  </tr>
</table>

---

## 🚀 Usage

### Opening the calculator

| Action | How |
|--------|-----|
| **Command palette** | <kbd>⌘/Ctrl+P</kbd> → `Open quick calculator` or `Open system calculator` |
| **Ribbon icon** | Click the 🧮 in the left sidebar (configurable in settings) |

### Keyboard shortcuts *inside the calculator*

| Key | Action |
|-----|--------|
| <kbd>0</kbd>–<kbd>9</kbd> | Digits |
| <kbd>.</kbd> | Decimal point |
| <kbd>+</kbd> <kbd>-</kbd> <kbd>*</kbd> <kbd>/</kbd> <kbd>%</kbd> <kbd>^</kbd> | Operators |
| <kbd>(</kbd> <kbd>)</kbd> | Parentheses |
| <kbd>Enter</kbd> / <kbd>=</kbd> | Evaluate |
| <kbd>Backspace</kbd> | Delete |
| <kbd>C</kbd> | Clear |
| <kbd>⌘/Ctrl+M</kbd> | Toggle Basic / Scientific |
| <kbd>Escape</kbd> | Close |

### Header buttons

| Button | What it does |
|:------:|-------------|
| `Basic▾` / `Sci▾` | Toggle between Basic and Scientific modes |
| `DEG` / `RAD` | Switch angle units *(Scientific mode only)* |
| 📝 | Insert expression = result into the active note |
| 📋 | Copy expression as LaTeX to clipboard |
| ⏱ | Open calculation history |
| ✕ | Close the calculator |

### On mobile 📱

- Tap buttons like a regular calculator
- Or tap the **text input** field below the memory bar to type expressions with the keyboard
- Press **Enter** to evaluate and dismiss the keyboard
- Full-width layout optimized for phone screens

---

## 🎨 LaTeX export

Click **📋** to copy your expression as a MathJax-ready formula:

| You type | Copied LaTeX |
|----------|-------------|
| `sin(45) + sqrt(16)` | `$\sin(45) + \sqrt{16}$` |
| `pi * e^2` | `$\pi \times e^{2}$` |
| `log(100) + ln(e)` | `$\log_{10}(100) + \ln(e)$` |
| `tan(30) + cos(60)` | `$\tan(30) + \cos(60)$` |

Paste into any Obsidian note — MathJax renders it beautifully.

---

## ⚙️ Settings

| Setting | Description | Default |
|---------|-------------|---------|
| **Ribbon icon action** | What happens when you click the ribbon icon | `Open system calculator` |
| **Insert template** | Format used when inserting into a note. Use `{{expression}}` and `{{result}}` | `` `{{expression}}` = **{{result}}** `` |

### Template examples

```markdown
# Default
`sin(45)` = **0.7071**

# Pure LaTeX
$sin(45)$ = 0.7071

# Plain text
sin(45) = 0.7071

# Task list
- [ ] `sin(45)` → **0.7071**
```

---

## 🖥️ Platform support

| Platform | System Calculator | In-App Calculator |
|----------|:-----------------:|:-----------------:|
| 🍎 macOS | ✅ Calculator.app | ✅ |
| 🪟 Windows | ✅ calc.exe | ✅ |
| 🐧 Linux | ✅ gnome-calculator / kcalc / qalculate-gtk / xcalc | ✅ |
| 📱 iOS | — | ✅ |
| 🤖 Android | — | ✅ |

---

## 📦 Installation

### Community Plugin Store *(recommended)*

1. Open Obsidian → Settings → Community plugins
2. Click **Browse** and search for **Quick Calculator**
3. Install and enable

### BRAT (beta)

1. Install the [BRAT](https://github.com/TfTHacker/obsidian42-brat) plugin
2. Add this repository: `https://github.com/jphermans/obsidian-quick-calculator`

### Manual

1. Download `main.js`, `manifest.json`, and `styles.css` from the [latest release](https://github.com/jphermans/obsidian-quick-calculator/releases)
2. Copy into `<Vault>/.obsidian/plugins/quick-calculator/`
3. Enable in Settings → Community plugins

---

## 🔧 Building from source

```bash
git clone https://github.com/jphermans/obsidian-quick-calculator
cd obsidian-quick-calculator
npm install
npm run build   # production build
npm run dev     # watch mode — rebuilds on save
```

---

## 🤝 Contributing

Pull requests welcome! If you find a bug or have a feature idea, please [open an issue](https://github.com/jphermans/obsidian-quick-calculator/issues).

Before submitting, please ensure:

- [ ] Build passes: `npm run build` (zero errors)
- [ ] No `eval()`, `new Function()`, or `innerHTML` usage
- [ ] Works on both desktop and mobile
- [ ] Theme-aware (test light + dark)

---

## 📄 License

[MIT](LICENSE) © 2026 Hermes
