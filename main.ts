import {
  App,
  ItemView,
  MarkdownView,
  Modal,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  Platform,
  WorkspaceLeaf,
} from "obsidian";

// ─── Types ──────────────────────────────────────────────────────────────────

interface QuickCalculatorSettings {
  ribbonAction: "system" | "modal" | "panel";
  insertTemplate: string;
}

const DEFAULT_SETTINGS: QuickCalculatorSettings = {
  ribbonAction: "system",
  insertTemplate: "`{{expression}}` = **{{result}}**",
};

type CalcMode = "basic" | "scientific";
type AngleMode = "deg" | "rad";

interface HistoryEntry {
  expression: string;
  result: string;
}

// ─── Safe Expression Parser ─────────────────────────────────────────────────
// Recursive-descent — no eval, no Function constructor. Passes Obsidian store review.

class ExpressionParser {
  private expr = "";
  private pos = 0;
  private angleMode: AngleMode = "deg";

  /** Evaluate a user-facing expression string. Throws on parse/eval errors. */
  evaluate(raw: string, angleMode: AngleMode = "deg"): number {
    this.angleMode = angleMode;
    // Normalise display chars to JS operators
    this.expr = raw
      .replace(/×/g, "*")
      .replace(/÷/g, "/")
      .replace(/−/g, "-")
      .replace(/\s+/g, "");
    this.pos = 0;
    const val = this.expr_();
    if (this.pos < this.expr.length) {
      throw new Error(`Unexpected token at position ${this.pos}`);
    }
    return val;
  }

  // ── grammar: expr → term (('+' | '-') term)* ──

  private expr_(): number {
    let left = this.term_();
    while (this.pos < this.expr.length) {
      const ch = this.expr[this.pos];
      if (ch === "+") { this.pos++; left += this.term_(); }
      else if (ch === "-") { this.pos++; left -= this.term_(); }
      else break;
    }
    return left;
  }

  // ── term → factor (('*' | '/') factor)* ──

  private term_(): number {
    let left = this.unary_();
    while (this.pos < this.expr.length) {
      const ch = this.expr[this.pos];
      if (ch === "*") { this.pos++; left *= this.unary_(); }
      else if (ch === "/") {
        this.pos++;
        const divisor = this.unary_();
        if (divisor === 0) throw new Error("Division by zero");
        left /= divisor;
      }
      else break;
    }
    return left;
  }

  // ── unary → ('+' | '-') unary | power ──

  private unary_(): number {
    if (this.pos < this.expr.length && this.expr[this.pos] === "-") {
      this.pos++;
      return -this.unary_();
    }
    if (this.pos < this.expr.length && this.expr[this.pos] === "+") {
      this.pos++;
      return this.unary_();
    }
    return this.power_();
  }

  // ── power → atom ('^' power)? ──

  private power_(): number {
    const base = this.atom_();
    if (this.pos < this.expr.length && this.expr[this.pos] === "^") {
      this.pos++;
      const exp = this.power_(); // right-associative
      return Math.pow(base, exp);
    }
    return base;
  }

  // ── atom → NUMBER | '(' expr ')' | function '(' expr ')' | CONSTANT | atom '!' ──

  private atom_(): number {
    let val: number;

    if (this.pos >= this.expr.length) {
      throw new Error("Unexpected end of expression");
    }

    const ch = this.expr[this.pos];

    // Number
    if ((ch >= "0" && ch <= "9") || ch === ".") {
      val = this.number_();
    }
    // Parenthesised sub-expression
    else if (ch === "(") {
      this.pos++;
      val = this.expr_();
      this.expect(")");
    }
    // Named function or constant
    else if ((ch >= "a" && ch <= "z") || (ch >= "A" && ch <= "Z") || ch === "π" || ch === "√") {
      const name = this.identifier_();
      val = this.resolveIdentifier_(name);
    }
    else {
      throw new Error(`Unexpected character '${ch}' at position ${this.pos}`);
    }

    // Postfix factorial
    while (this.pos < this.expr.length && this.expr[this.pos] === "!") {
      this.pos++;
      if (val < 0 || !Number.isInteger(val)) {
        throw new Error("Factorial only defined for non-negative integers");
      }
      val = this.factorial_(val);
    }

    // Postfix percentage: val% means val/100
    while (this.pos < this.expr.length && this.expr[this.pos] === "%") {
      this.pos++;
      if (val === 0) continue;
      val = val / 100;
    }

    return val;
  }

  // ── helpers ──

  private number_(): number {
    const start = this.pos;
    while (this.pos < this.expr.length && /[0-9.]/.test(this.expr[this.pos])) {
      this.pos++;
    }
    const num = parseFloat(this.expr.slice(start, this.pos));
    if (isNaN(num)) throw new Error(`Invalid number at position ${start}`);
    return num;
  }

  private identifier_(): string {
    const start = this.pos;
    // Allow Greek π and √ in identifiers
    while (
      this.pos < this.expr.length &&
      /[a-zA-Z0-9_π√]/.test(this.expr[this.pos])
    ) {
      this.pos++;
    }
    return this.expr.slice(start, this.pos);
  }

  private expect(ch: string): void {
    if (this.pos >= this.expr.length || this.expr[this.pos] !== ch) {
      throw new Error(`Expected '${ch}' at position ${this.pos}`);
    }
    this.pos++;
  }

  private resolveIdentifier_(name: string): number {
    // Built-in functions (require parens after)
    const functions: Record<string, (x: number) => number> = {
      sin: (x) => {
        const rad = this.angleMode === "deg" ? (x * Math.PI) / 180 : x;
        return parseFloat(Math.sin(rad).toPrecision(12));
      },
      cos: (x) => {
        const rad = this.angleMode === "deg" ? (x * Math.PI) / 180 : x;
        return parseFloat(Math.cos(rad).toPrecision(12));
      },
      tan: (x) => {
        const rad = this.angleMode === "deg" ? (x * Math.PI) / 180 : x;
        const result = Math.tan(rad);
        if (Math.abs(result) > 1e15) throw new Error("tan is undefined at this angle");
        return parseFloat(result.toPrecision(12));
      },
      sqrt: (x) => {
        if (x < 0) throw new Error("Cannot take square root of negative number");
        return Math.sqrt(x);
      },
      log: (x) => {
        if (x <= 0) throw new Error("log undefined for non-positive numbers");
        return Math.log10(x);
      },
      ln: (x) => {
        if (x <= 0) throw new Error("ln undefined for non-positive numbers");
        return Math.log(x);
      },
      abs: (x) => Math.abs(x),
      floor: (x) => Math.floor(x),
      ceil: (x) => Math.ceil(x),
      round: (x) => Math.round(x),
    };

    if (name in functions) {
      this.expect("(");
      const arg = this.expr_();
      this.expect(")");
      return functions[name](arg);
    }

    // Constants
    const constants: Record<string, number> = {
      pi: Math.PI,
      π: Math.PI,
      e: Math.E,
    };
    if (name in constants) {
      return constants[name];
    }

    throw new Error(`Unknown identifier: '${name}'`);
  }

  private factorial_(n: number): number {
    if (n > 170) throw new Error("Factorial too large");
    let result = 1;
    for (let i = 2; i <= n; i++) result *= i;
    return result;
  }

  // ── LaTeX export ──────────────────────────────────────────

  /** Convert a user-facing expression to LaTeX suitable for Obsidian MathJax. */
  static toLatex(raw: string): string {
    let latex = raw
      .replace(/×/g, " \\times ")
      .replace(/÷/g, " \\div ")
      .replace(/−/g, "-");

    // Named functions
    latex = latex
      .replace(/\bsin\(/g, "\\sin(")
      .replace(/\bcos\(/g, "\\cos(")
      .replace(/\btan\(/g, "\\tan(")
      .replace(/\blog\(/g, "\\log_{10}(")
      .replace(/\bln\(/g, "\\ln(")
      .replace(/\babs\(/g, "\\lvert ")
      .replace(/\bfloor\(/g, "\\lfloor ")
      .replace(/\bceil\(/g, "\\lceil ")
      .replace(/\bround\(/g, "\\operatorname{round}(");

    // sqrt(…) → \sqrt{…}
    latex = ExpressionParser.replaceSqrt_(latex);

    // Constants
    latex = latex.replace(/\bpi\b/g, "\\pi");

    // Exponents: ^number or ^(expr) → ^{…}
    latex = latex.replace(/\^(\d+(?:\.\d+)?)/g, "^{$1}");
    latex = latex.replace(/\^\((-?\d+(?:\.\d+)?)\)/g, "^{$1}");

    return latex;
  }

  /** Replace sqrt(expr) with \sqrt{expr} by matching parens. */
  private static replaceSqrt_(expr: string): string {
    let result = "";
    let i = 0;
    while (i < expr.length) {
      if (expr.startsWith("sqrt(", i)) {
        result += "\\sqrt{";
        i += 5;
        let depth = 1;
        let inner = "";
        while (i < expr.length && depth > 0) {
          if (expr[i] === "(") depth++;
          else if (expr[i] === ")") depth--;
          if (depth > 0) inner += expr[i];
          i++;
        }
        result += inner + "}";
      } else {
        result += expr[i];
        i++;
      }
    }
    return result;
  }
}

// ─── Calculator Modal ────────────────────────────────────────────────────────

const HISTORY_LIMIT = 20;
const MEMORY_KEY = "qc-memory-value";
const HISTORY_STORAGE_KEY = "qc-history";

class CalculatorModal extends Modal {
  private display!: HTMLDivElement;
  private latexEl!: HTMLDivElement;
  private modeEl!: HTMLSpanElement;
  private angleEl!: HTMLSpanElement;
  private memoryDisplay!: HTMLSpanElement;

  private expression = "";
  private lastExpression = ""; // preserved for insert/copy after evaluation
  private lastResult = "";
  private mode: CalcMode = "basic";
  private angleMode: AngleMode = "deg";
  private memory = 0;
  private history: HistoryEntry[] = [];
  private parser = new ExpressionParser();

  // Grid containers (rebuilt on mode switch)
  private gridContainer!: HTMLDivElement;
  private memoryBar!: HTMLDivElement;
  private mobileInputEl!: HTMLInputElement;

  settings: QuickCalculatorSettings;

  constructor(app: App) {
    super(app);
    this.settings = DEFAULT_SETTINGS;
  }

  onOpen() {
    const { contentEl } = this;
    contentEl.addClass("qc-modal");
    this.buildPanel_(contentEl, () => this.close(), true);
  }

  /** Build the calculator UI into a container element. Used by both modal and panel view. */
  buildPanel_(container: HTMLElement, onClose: () => void, showCloseBtn: boolean): void {
    container.setAttr("tabindex", "0");

    // Restore memory from localStorage
    this.loadMemory_();

    // ── Header ──
    const header = container.createDiv("qc-header");

    const leftGroup = header.createDiv("qc-header-left");
    // Mode toggle
    this.modeEl = leftGroup.createSpan("qc-mode-toggle");
    this.modeEl.setText(this.mode === "scientific" ? "Sci ▾" : "Basic ▾");
    this.modeEl.addEventListener("click", () => this.cycleMode_());

    // Angle toggle (scientific only)
    this.angleEl = leftGroup.createSpan("qc-angle-toggle");
    this.updateAngleEl_();
    this.angleEl.addEventListener("click", () => this.toggleAngleMode_());

    const rightGroup = header.createDiv("qc-header-right");
    // Insert into note
    const insertBtn = rightGroup.createSpan("qc-header-btn");
    insertBtn.setText("📝");
    insertBtn.setAttr("aria-label", "Insert into note");
    insertBtn.addEventListener("click", () => this.insertIntoNote_());

    // Copy LaTeX
    const latexBtn = rightGroup.createSpan("qc-header-btn");
    latexBtn.setText("📋");
    latexBtn.setAttr("aria-label", "Copy LaTeX");
    latexBtn.addEventListener("click", () => this.copyLatex_());

    // History button
    const histBtn = rightGroup.createSpan("qc-header-btn");
    histBtn.setText("⏱");
    histBtn.setAttr("aria-label", "History");
    histBtn.addEventListener("click", () => this.showHistory_());

    if (showCloseBtn) {
      const closeBtn = rightGroup.createSpan("qc-header-btn");
      closeBtn.setText("✕");
      closeBtn.setAttr("aria-label", "Close");
      closeBtn.addEventListener("click", onClose);
    }

    // ── Display ──
    this.display = container.createDiv("qc-display");
    this.renderDisplay_();

    // ── LaTeX preview ──
    this.latexEl = container.createDiv("qc-latex-preview");
    this.renderLatexPreview_();

    // ── Mobile text input (above grid) ──
    this.mobileInputEl = container.createEl("input", {
      cls: "qc-mobile-input",
      attr: {
        type: "text",
        inputmode: "text",
        autocomplete: "off",
        autocorrect: "off",
        autocapitalize: "off",
        spellcheck: "false",
        placeholder: "Type expression…",
      },
    }) as HTMLInputElement;
    this.mobileInputEl.addEventListener("input", () => {
      this.expression = this.mobileInputEl.value;
      if (this.expression) {
        this.display.setText(this.expression);
        this.renderLatexPreview_();
      } else {
        this.lastResult = "";
        this.renderDisplay_();
      }
    });
    this.mobileInputEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        this.evaluate();
        this.mobileInputEl.value = "";
        this.mobileInputEl.blur();
      } else if (e.key === "Escape") {
        onClose();
      }
    });
    this.mobileInputEl.addEventListener("focus", () => {
      setTimeout(() => {
        this.mobileInputEl.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }, 350);
    });
    this.mobileInputEl.addEventListener("blur", () => {
      if (Platform.isMobile) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });

    // ── Grid ──
    this.gridContainer = container.createDiv("qc-grid-container");
    this.buildGrid_();

    // ── Memory bar ──
    this.memoryBar = container.createDiv("qc-memory-bar");
    this.buildMemoryBar_();

    // Keyboard
    container.addEventListener("keydown", (e) => this.onKey_(e));
    if (!Platform.isMobile) {
      requestAnimationFrame(() => container.focus());
    }
  }

  onClose() {
    this.contentEl.empty();
    this.saveMemory_();
  }

  // ─── Grid ────────────────────────────────────────────────

  private buildGrid_(): void {
    this.gridContainer.empty();

    const grid = this.gridContainer.createDiv("qc-grid");
    grid.addClass(this.mode === "scientific" ? "qc-grid-sci" : "qc-grid-basic");

    const B = this.btn.bind(this);

    if (this.mode === "basic") {
      // 4 columns
      grid.appendChild(B("qc-fn", "C", () => this.clear()));
      grid.appendChild(B("qc-fn", "⌫", () => this.backspace()));
      grid.appendChild(B("qc-op", "%", () => this.pushOp("%")));
      grid.appendChild(B("qc-op", "÷", () => this.pushOp("/")));

      grid.appendChild(B("qc-num", "7", () => this.pushDigit("7")));
      grid.appendChild(B("qc-num", "8", () => this.pushDigit("8")));
      grid.appendChild(B("qc-num", "9", () => this.pushDigit("9")));
      grid.appendChild(B("qc-op", "×", () => this.pushOp("*")));

      grid.appendChild(B("qc-num", "4", () => this.pushDigit("4")));
      grid.appendChild(B("qc-num", "5", () => this.pushDigit("5")));
      grid.appendChild(B("qc-num", "6", () => this.pushDigit("6")));
      grid.appendChild(B("qc-op", "−", () => this.pushOp("-")));

      grid.appendChild(B("qc-num", "1", () => this.pushDigit("1")));
      grid.appendChild(B("qc-num", "2", () => this.pushDigit("2")));
      grid.appendChild(B("qc-num", "3", () => this.pushDigit("3")));
      grid.appendChild(B("qc-op", "+", () => this.pushOp("+")));

      grid.appendChild(B("qc-fn", "±", () => this.negate()));
      grid.appendChild(B("qc-num", "0", () => this.pushDigit("0")));
      grid.appendChild(B("qc-num", ".", () => this.pushDot()));
      grid.appendChild(B("qc-eq", "=", () => this.evaluate()));
    } else {
      // Scientific — 5 columns + extra rows
      // Row 1: parens + edit
      grid.appendChild(B("qc-sci-fn", "(", () => this.pushText("(")));
      grid.appendChild(B("qc-sci-fn", ")", () => this.pushText(")")));
      grid.appendChild(B("qc-fn", "C", () => this.clear()));
      grid.appendChild(B("qc-fn", "⌫", () => this.backspace()));
      grid.appendChild(B("qc-op", "%", () => this.pushOp("%")));

      // Row 2: trig
      grid.appendChild(B("qc-sci-fn", "sin", () => this.pushFunc("sin(")));
      grid.appendChild(B("qc-sci-fn", "cos", () => this.pushFunc("cos(")));
      grid.appendChild(B("qc-sci-fn", "tan", () => this.pushFunc("tan(")));
      grid.appendChild(B("qc-sci-fn", "log", () => this.pushFunc("log(")));
      grid.appendChild(B("qc-sci-fn", "ln", () => this.pushFunc("ln(")));

      // Row 3: more functions + constants
      grid.appendChild(B("qc-sci-fn", "√", () => this.pushFunc("sqrt(")));
      grid.appendChild(B("qc-sci-fn", "x²", () => this.pushText("^2")));
      grid.appendChild(B("qc-sci-fn", "xʸ", () => this.pushText("^")));
      grid.appendChild(B("qc-sci-const", "π", () => this.pushText("pi")));
      grid.appendChild(B("qc-sci-const", "e", () => this.pushText("e")));

      // Row 4: 7 8 9 ÷ abs
      grid.appendChild(B("qc-num", "7", () => this.pushDigit("7")));
      grid.appendChild(B("qc-num", "8", () => this.pushDigit("8")));
      grid.appendChild(B("qc-num", "9", () => this.pushDigit("9")));
      grid.appendChild(B("qc-op", "÷", () => this.pushOp("/")));
      grid.appendChild(B("qc-sci-fn", "abs", () => this.pushFunc("abs(")));

      // Row 5: 4 5 6 × !
      grid.appendChild(B("qc-num", "4", () => this.pushDigit("4")));
      grid.appendChild(B("qc-num", "5", () => this.pushDigit("5")));
      grid.appendChild(B("qc-num", "6", () => this.pushDigit("6")));
      grid.appendChild(B("qc-op", "×", () => this.pushOp("*")));
      grid.appendChild(B("qc-sci-fn", "n!", () => this.pushText("!")));

      // Row 6: 1 2 3 − 1/x
      grid.appendChild(B("qc-num", "1", () => this.pushDigit("1")));
      grid.appendChild(B("qc-num", "2", () => this.pushDigit("2")));
      grid.appendChild(B("qc-num", "3", () => this.pushDigit("3")));
      grid.appendChild(B("qc-op", "−", () => this.pushOp("-")));
      grid.appendChild(B("qc-sci-fn", "1/x", () => this.pushText("^(-1)")));

      // Row 7: ± 0 . + =
      grid.appendChild(B("qc-fn", "±", () => this.negate()));
      grid.appendChild(B("qc-num", "0", () => this.pushDigit("0")));
      grid.appendChild(B("qc-num", ".", () => this.pushDot()));
      grid.appendChild(B("qc-op", "+", () => this.pushOp("+")));
      grid.appendChild(B("qc-eq", "=", () => this.evaluate()));
    }
  }

  private buildMemoryBar_(): void {
    this.memoryBar.empty();

    const mc = this.memBtn("MC", () => { this.memory = 0; this.saveMemory_(); this.updateMemoryDisplay_(); });
    const mr = this.memBtn("MR", () => { this.pushText(String(this.memory)); });
    const mp = this.memBtn("M+", () => {
      const val = this.getCurrentValue_();
      this.memory += val;
      this.saveMemory_();
      this.updateMemoryDisplay_();
    });
    const mm = this.memBtn("M-", () => {
      const val = this.getCurrentValue_();
      this.memory -= val;
      this.saveMemory_();
      this.updateMemoryDisplay_();
    });

    this.memoryBar.appendChild(mc);
    this.memoryBar.appendChild(mr);
    this.memoryBar.appendChild(mp);
    this.memoryBar.appendChild(mm);

    this.memoryDisplay = this.memoryBar.createSpan("qc-memory-value");
    this.updateMemoryDisplay_();
  }

  private memBtn(label: string, handler: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = "qc-mem-btn";
    b.setText(label);
    b.addEventListener("click", handler);
    return b;
  }

  // ─── Button factory ───────────────────────────────────────

  private btn(cls: string, label: string, handler: () => void): HTMLButtonElement {
    const b = document.createElement("button");
    b.className = `qc-btn ${cls}`;
    b.setText(label);
    b.addEventListener("click", handler);
    return b;
  }

  // ─── Display ──────────────────────────────────────────────

  private renderDisplay_(): void {
    const text = this.expression || this.lastResult || "0";
    this.display.setText(text);
    const len = text.length;
    this.display.style.fontSize =
      len > 28 ? "1em" : len > 20 ? "1.2em" : len > 14 ? "1.6em" : "2.2em";
    this.renderLatexPreview_();
  }

  // ─── Input ────────────────────────────────────────────────

  private pushDigit(d: string): void {
    this.expression += d;
    this.renderDisplay_();
  }

  private pushDot(): void {
    const parts = this.expression.split(/[\+\-\*\/\^%\(\)]/);
    const last = parts[parts.length - 1];
    if (!last.includes(".")) {
      this.expression += this.expression === "" ? "0." : ".";
      this.renderDisplay_();
    }
  }

  private pushOp(op: string): void {
    if (this.expression === "" && this.lastResult !== "") {
      this.expression = this.lastResult + op;
      this.lastResult = "";
    } else if (this.expression !== "") {
      if (/[\+\-\*\/\^%]$/.test(this.expression)) {
        this.expression = this.expression.slice(0, -1) + op;
      } else {
        this.expression += op;
      }
    }
    this.renderDisplay_();
  }

  private pushText(text: string): void {
    this.expression += text;
    this.renderDisplay_();
  }

  private pushFunc(text: string): void {
    this.expression += text;
    this.renderDisplay_();
  }

  // ─── LaTeX preview ────────────────────────────────────────

  private renderLatexPreview_(): void {
    if (!this.latexEl) return;
    const expr = this.expression;
    if (!expr) {
      this.latexEl.setText("");
      this.latexEl.style.display = "none";
      return;
    }
    const latex = ExpressionParser.toLatex(expr);
    this.latexEl.setText("$" + latex + "$");
    this.latexEl.style.display = "";
  }

  // ─── Insert into note ─────────────────────────────────────

  private insertIntoNote_(): void {
    const expr = this.expression || this.lastExpression;
    const result = this.lastResult || "";
    if (!expr && !result) {
      new Notice("Nothing to insert.");
      return;
    }

    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      new Notice("Open a Markdown note to insert into.");
      return;
    }

    // Resolve template
    let text = this.settings.insertTemplate || "`{{expression}}` = **{{result}}**";
    text = text
      .replace(/\{\{expression\}\}/g, expr)
      .replace(/\{\{result\}\}/g, result);

    const editor = view.editor;
    const cursor = editor.getCursor();
    editor.replaceRange(text + "\n", cursor);
    editor.setCursor({ line: cursor.line + 1, ch: 0 });

    // Also copy as plain text (e.g. "88+12 = 100")
    const plainFormula = expr + (result ? " = " + result : "");
    this.writeClipboard_(plainFormula, "Inserted into note & copied to clipboard.");
  }

  // ─── Copy LaTeX ───────────────────────────────────────────

  private copyLatex_(): void {
    const expr = this.expression || this.lastExpression;
    if (!expr) {
      new Notice("Nothing to copy.");
      return;
    }
    const latex = ExpressionParser.toLatex(expr);
    const fullLatex = "$" + latex + "$";
    this.writeClipboard_(fullLatex, "LaTeX copied to clipboard.");
  }

  /** Cross-platform clipboard write with fallback for older mobile WebViews. */
  private writeClipboard_(text: string, successMsg: string): void {
    // Modern async clipboard API
    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      navigator.clipboard.writeText(text).then(
        () => new Notice(successMsg),
        () => this.fallbackCopy_(text, successMsg)
      );
      return;
    }
    this.fallbackCopy_(text, successMsg);
  }

  private fallbackCopy_(text: string, successMsg: string): void {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.position = "fixed";
    textarea.style.left = "-9999px";
    textarea.style.top = "-9999px";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    try {
      document.execCommand("copy");
      new Notice(successMsg);
    } catch {
      new Notice("Failed to copy to clipboard.");
    }
    document.body.removeChild(textarea);
  }

  private clear(): void {
    this.expression = "";
    this.lastExpression = "";
    this.lastResult = "";
    this.renderDisplay_();
  }

  private backspace(): void {
    // Delete multi-char functions atomically
    const funcs = ["sin(", "cos(", "tan(", "log(", "ln(", "sqrt(", "abs(", "floor(", "ceil(", "round("];
    for (const f of funcs) {
      if (this.expression.endsWith(f)) {
        this.expression = this.expression.slice(0, -f.length);
        this.renderDisplay_();
        return;
      }
    }
    this.expression = this.expression.slice(0, -1);
    this.renderDisplay_();
  }

  private negate(): void {
    if (this.expression === "") return;
    const match = this.expression.match(/(-?\d+\.?\d*)$/);
    if (match) {
      const num = match[1];
      const negated = num.startsWith("-") ? num.slice(1) : "-" + num;
      this.expression =
        this.expression.slice(0, this.expression.length - num.length) + negated;
      this.renderDisplay_();
    }
  }

  // ─── Percentage expansion ─────────────────────────────────

  /** Expand calculator-style percentages (e.g. 100+21% → 100+100*21/100).
   *  Only expands when % is at the end of the expression (or followed by non-digit).
   *  10%3 stays as modulo. */
  private expandPercentages_(expr: string): string {
    // No % → nothing to do
    const pctIdx = expr.lastIndexOf("%");
    if (pctIdx === -1) return expr;

    // If % is followed by a digit, it's modulo — don't touch
    if (pctIdx + 1 < expr.length && /[\d.]/.test(expr[pctIdx + 1])) return expr;

    // After the %, there may only be ) or whitespace
    const afterPct = expr.slice(pctIdx + 1);
    if (afterPct && !/^[)\s]*$/.test(afterPct)) return expr;

    // Find the number before the %
    let i = pctIdx - 1;
    while (i >= 0 && /[\d.]/.test(expr[i])) i--;
    const pctNum = expr.slice(i + 1, pctIdx);
    if (!pctNum) return expr;

    // Case: standalone number% → number/100
    if (i < 0) {
      return expr.slice(0, pctIdx) + "/100" + afterPct;
    }

    // Find operator before that number
    let j = i;
    while (j >= 0 && /\s/.test(expr[j])) j--;
    if (j < 0) {
      return expr.slice(0, pctIdx) + "/100" + afterPct;
    }
    const op = expr[j];
    if (!"+-*/".includes(op)) {
      return expr.slice(0, pctIdx) + "/100" + afterPct;
    }

    // Find base number before the operator
    let k = j - 1;
    while (k >= 0 && /[\d.]/.test(expr[k])) k--;
    const baseNum = expr.slice(k + 1, j);
    if (!baseNum) {
      return expr.slice(0, pctIdx) + "/100" + afterPct;
    }

    const before = expr.slice(0, k + 1);

    if (op === "+" || op === "-") {
      // X+Y% → X + X*Y/100
      return before + baseNum + op + baseNum + "*" + pctNum + "/100" + afterPct;
    } else if (op === "*") {
      // X*Y% → X*Y/100
      return before + baseNum + "*" + pctNum + "/100" + afterPct;
    } else {
      // X/Y% → X/Y*100
      return before + baseNum + "/" + pctNum + "*100" + afterPct;
    }
  }

  private evaluate(): void {
    if (this.expression === "") return;
    const expr = this.expression;
    try {
      const expanded = this.expandPercentages_(expr);
      const result = this.parser.evaluate(expanded, this.angleMode);
      const rounded = parseFloat(result.toPrecision(12));
      const resultStr = String(rounded);
      this.lastExpression = expr;
      this.lastResult = resultStr;
      this.display.setText(resultStr);
      this.expression = "";

      // Sync mobile input
      if (this.mobileInputEl) this.mobileInputEl.value = "";

      // Save to history
      this.history.unshift({ expression: expr, result: resultStr });
      if (this.history.length > HISTORY_LIMIT) this.history.pop();
      this.saveHistory_();
    } catch (err) {
      this.display.setText(err instanceof Error ? err.message : "Error");
      this.expression = "";
      if (this.mobileInputEl) this.mobileInputEl.value = "";
    }
  }

  // ─── Mode toggles ─────────────────────────────────────────

  private cycleMode_(): void {
    this.mode = this.mode === "basic" ? "scientific" : "basic";
    this.modeEl.setText(this.mode === "scientific" ? "Sci ▾" : "Basic ▾");
    this.updateAngleEl_();
    this.buildGrid_();
    if (!Platform.isMobile) {
      requestAnimationFrame(() => this.contentEl.focus());
    }
  }

  private toggleAngleMode_(): void {
    this.angleMode = this.angleMode === "deg" ? "rad" : "deg";
    this.updateAngleEl_();
    if (!Platform.isMobile) {
      requestAnimationFrame(() => this.contentEl.focus());
    }
  }

  private updateAngleEl_(): void {
    if (this.mode === "scientific") {
      this.angleEl.setText(this.angleMode === "deg" ? "DEG" : "RAD");
      this.angleEl.style.display = "";
    } else {
      this.angleEl.style.display = "none";
    }
  }

  // ─── Memory ──────────────────────────────────────────────

  private getCurrentValue_(): number {
    try {
      if (this.expression) return this.parser.evaluate(this.expression, this.angleMode);
      if (this.lastResult) return parseFloat(this.lastResult);
    } catch { /* fall through */ }
    return 0;
  }

  private updateMemoryDisplay_(): void {
    if (this.memoryDisplay) {
      this.memoryDisplay.setText(this.memory !== 0 ? `M: ${this.memory}` : "");
    }
  }

  private loadMemory_(): void {
    try {
      const stored = localStorage.getItem(MEMORY_KEY);
      if (stored !== null) this.memory = parseFloat(stored) || 0;

      const histStored = localStorage.getItem(HISTORY_STORAGE_KEY);
      if (histStored) this.history = JSON.parse(histStored);
    } catch { /* ignore corrupt data */ }
  }

  private saveMemory_(): void {
    try {
      localStorage.setItem(MEMORY_KEY, String(this.memory));
    } catch { /* quota exceeded, ignore */ }
  }

  private saveHistory_(): void {
    try {
      localStorage.setItem(HISTORY_STORAGE_KEY, JSON.stringify(this.history));
    } catch { /* ignore */ }
  }

  // ─── History popup ────────────────────────────────────────

  private showHistory_(): void {
    if (this.history.length === 0) {
      new Notice("No calculation history yet.");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "qc-history-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) overlay.remove();
    });

    const panel = overlay.createDiv("qc-history-panel");
    panel.createDiv("qc-history-title").setText("History");

    const list = panel.createDiv("qc-history-list");
    for (const entry of this.history) {
      const row = list.createDiv("qc-history-row");
      row.addEventListener("click", () => {
        this.expression = "";
        this.lastExpression = entry.expression;
        this.lastResult = entry.result;
        this.renderDisplay_();
        overlay.remove();
        if (!Platform.isMobile) {
          requestAnimationFrame(() => this.contentEl.focus());
        }
      });

      const exprEl = row.createSpan("qc-history-expr");
      exprEl.setText(entry.expression);
      const eqEl = row.createSpan("qc-history-eq");
      eqEl.setText("=");
      const resEl = row.createSpan("qc-history-res");
      resEl.setText(entry.result);
    }

    const footer = panel.createDiv("qc-history-footer");
    const clearBtn = footer.createSpan("qc-history-clear");
    clearBtn.setText("Clear history");
    clearBtn.addEventListener("click", () => {
      this.history = [];
      this.saveHistory_();
      overlay.remove();
    });

    // Close on Escape
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        overlay.remove();
        document.removeEventListener("keydown", escHandler);
      }
    };
    document.addEventListener("keydown", escHandler);

    document.body.appendChild(overlay);
  }

  // ─── Keyboard ─────────────────────────────────────────────

  private onKey_(e: KeyboardEvent): void {
    const k = e.key;

    // Don't capture when history overlay is open
    if (document.querySelector(".qc-history-overlay")) return;

    if (k >= "0" && k <= "9") {
      e.preventDefault(); this.pushDigit(k);
    } else if (k === ".") {
      e.preventDefault(); this.pushDot();
    } else if (k === "+" || k === "-" || k === "*" || k === "/") {
      e.preventDefault(); this.pushOp(k);
    } else if (k === "%") {
      e.preventDefault(); this.pushOp("%");
    } else if (k === "^") {
      e.preventDefault(); this.pushText("^");
    } else if (k === "(" || k === ")") {
      e.preventDefault(); this.pushText(k);
    } else if (k === "Enter" || k === "=") {
      e.preventDefault(); this.evaluate();
    } else if (k === "Backspace") {
      e.preventDefault(); this.backspace();
    } else if (k === "Escape") {
      this.close();
    } else if (k === "c" || k === "C") {
      e.preventDefault(); this.clear();
    } else if (k === "m" || k === "M") {
      // Toggle mode
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault(); this.cycleMode_();
      }
    }
  }
}

// ─── Calculator Panel View (dockable, persistent) ──────────────────────────

const CALCULATOR_VIEW_TYPE = "quick-calculator-panel";

class QuickCalculatorView extends ItemView {
  private modal!: CalculatorModal;
  settings: QuickCalculatorSettings = DEFAULT_SETTINGS;

  constructor(leaf: WorkspaceLeaf) {
    super(leaf);
  }

  getViewType(): string { return CALCULATOR_VIEW_TYPE; }
  getDisplayText(): string { return "Quick Calculator"; }
  getIcon(): string { return "calculator"; }

  async onOpen() {
    this.modal = new CalculatorModal(this.app);
    this.modal.settings = this.settings;
    // Monkey-patch: render into our container, not a modal overlay
    this.modal.onOpen = () => {
      const el = this.containerEl.children[1] as HTMLElement;
      el.empty();
      el.addClass("qc-panel");
      el.setAttr("tabindex", "0");
      this.modal.buildPanel_(el, () => {
        // Panel close — optionally clear the display
      }, false);
    };
    this.modal.onOpen();
  }

  async onClose() {
    this.modal.onClose();
  }
}

// ─── Plugin ──────────────────────────────────────────────────────────────────

export default class QuickCalculatorPlugin extends Plugin {
  settings!: QuickCalculatorSettings;

  async onload() {
    await this.loadSettings();

    // ── Dockable panel view (desktop) ──
    this.registerView(
      CALCULATOR_VIEW_TYPE,
      (leaf) => {
        const view = new QuickCalculatorView(leaf);
        view.settings = this.settings;
        return view;
      }
    );

    this.addCommand({
      id: "open-calculator-panel",
      name: "Open calculator panel",
      callback: () => this.activateView_(),
    });

    // In-app calculator modal — always available
    this.addCommand({
      id: "open-modal-calculator",
      name: "Open quick calculator (modal)",
      callback: () => this.createModal_().open(),
    });

    // System calculator — desktop only
    if (Platform.isDesktop) {
      this.addCommand({
        id: "open-system-calculator",
        name: "Open system calculator",
        callback: () => this.openSystemCalculator(),
      });
    }

    // Ribbon icon
    this.addRibbonIcon("calculator", "Quick Calculator", () => {
      if (Platform.isDesktop && this.settings.ribbonAction === "panel") {
        this.activateView_();
      } else if (this.settings.ribbonAction === "modal" || Platform.isMobile) {
        this.createModal_().open();
      } else {
        this.openSystemCalculator();
      }
    });

    this.addSettingTab(new QuickCalculatorSettingTab(this.app, this));
  }

  onunload() {
    this.app.workspace.detachLeavesOfType(CALCULATOR_VIEW_TYPE);
  }

  async loadSettings() {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings() {
    await this.saveData(this.settings);
  }

  private createModal_(): CalculatorModal {
    const modal = new CalculatorModal(this.app);
    modal.settings = this.settings;
    return modal;
  }

  private async activateView_(): Promise<void> {
    const { workspace } = this.app;

    // Reveal existing leaf if already open
    const existing = workspace.getLeavesOfType(CALCULATOR_VIEW_TYPE);
    if (existing.length > 0) {
      workspace.revealLeaf(existing[0]);
      return;
    }

    // Open in right sidebar
    const leaf = workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: CALCULATOR_VIEW_TYPE, active: true });
      workspace.revealLeaf(leaf);
    }
  }

  private openSystemCalculator(): void {
    if (!Platform.isDesktop) {
      new Notice("System calculator only available on desktop.");
      return;
    }

    let cmd: string;

    if (Platform.isMacOS) {
      cmd = "open -a Calculator";
    } else if (Platform.isWin) {
      cmd = "calc.exe";
    } else if (Platform.isLinux) {
      cmd =
        'gnome-calculator 2>/dev/null || kcalc 2>/dev/null || qalculate-gtk 2>/dev/null || xcalc';
    } else {
      new Notice("System calculator not available on this platform.");
      return;
    }

    try {
      // Dynamic require — child_process exists only in Electron (desktop)
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { exec } = require("child_process");
      exec(cmd, (error: Error | null) => {
        if (error) {
          new Notice(
            "Could not open system calculator. Try the in-app calculator instead."
          );
        }
      });
    } catch {
      new Notice("System calculator not available. Use the in-app calculator instead.");
    }
  }
}

// ─── Settings Tab ────────────────────────────────────────────────────────────

class QuickCalculatorSettingTab extends PluginSettingTab {
  plugin: QuickCalculatorPlugin;

  constructor(app: App, plugin: QuickCalculatorPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    // ── Banner ──
    const banner = containerEl.createDiv("qc-settings-banner");
    banner.createEl("h1", { text: "🧮 Quick Calculator" });
    banner.createEl("p", {
      text: "Instant calculations from anywhere in Obsidian — desktop & mobile.",
      cls: "qc-settings-subtitle",
    });

    // ── Credentials ──
    const creds = containerEl.createDiv("qc-settings-creds");
    creds.createEl("span", { text: "v1.2.2", cls: "qc-settings-badge" });
    creds.createEl("span", { text: "JPHsystems", cls: "qc-settings-badge" });
    creds.createEl("span", { text: "MIT", cls: "qc-settings-badge" });

    // ── How it works ──
    const docs = containerEl.createDiv("qc-settings-docs");
    docs.createEl("h3", { text: "📖 How it works" });

    const items = [
      { icon: "🖥️", title: "System launcher", desc: "Opens your OS calculator — macOS Calculator.app, Windows calc.exe, or Linux equivalent." },
      { icon: "📌", title: "Side panel", desc: "Docks a persistent calculator in Obsidian's right sidebar. Resize it, switch notes — it stays open." },
      { icon: "💬", title: "Floating modal", desc: "Quick popup calculator that works everywhere, including mobile (iOS/Android)." },
      { icon: "🔬", title: "Scientific", desc: "Toggle Basic/Scientific with the mode button or Cmd/Ctrl+M. Trig, log, sqrt, pi, e, factorial, and more." },
      { icon: "💯", title: "Percentage", desc: "Real calculator logic: 100+21% = 121, 100−21% = 79, 50×10% = 5." },
      { icon: "📝", title: "Insert", desc: "Writes expression = result into your active note AND copies to clipboard in one tap." },
      { icon: "📋", title: "LaTeX", desc: "Copies MathJax-ready formulas. Live preview shows the LaTeX as you type." },
    ];

    for (const item of items) {
      const row = docs.createDiv("qc-settings-doc-row");
      row.createSpan("qc-settings-doc-icon").setText(item.icon);
      const body = row.createDiv("qc-settings-doc-body");
      body.createEl("strong", { text: item.title });
      body.createEl("p", { text: item.desc, cls: "setting-item-description" });
    }

    // ── Settings ──
    containerEl.createEl("h3", { text: "⚙️ Settings" });

    new Setting(containerEl)
      .setName("Ribbon icon action")
      .setDesc(
        "What happens when you click the calculator ribbon icon? On mobile the in-app modal is always used."
      )
      .addDropdown((dropdown) =>
        dropdown
          .addOption("system", "Open system calculator")
          .addOption("modal", "Open in-app modal")
          .addOption("panel", "Open side panel")
          .setValue(this.plugin.settings.ribbonAction)
          .onChange(async (value) => {
            this.plugin.settings.ribbonAction = value as "system" | "modal" | "panel";
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Insert template")
      .setDesc(
        "Template used when inserting a calculation into a note. Use {{expression}} and {{result}} as placeholders."
      )
      .addText((text) =>
        text
          .setPlaceholder("`{{expression}}` = **{{result}}**")
          .setValue(this.plugin.settings.insertTemplate)
          .onChange(async (value) => {
            this.plugin.settings.insertTemplate = value;
            await this.plugin.saveSettings();
          })
      );

    // ── Commands reference ──
    containerEl.createEl("h3", { text: "⌨️ Commands" });
    const cmds = [
      ["Open calculator panel", "Dock calculator in right sidebar"],
      ["Open quick calculator (modal)", "Floating popup (all platforms)"],
      ["Open system calculator", "Your OS calculator (desktop only)"],
    ];
    for (const [name, desc] of cmds) {
      const row = containerEl.createDiv("qc-settings-cmd");
      row.createEl("code", { text: name });
      row.createSpan("setting-item-description").setText(" — " + desc);
    }

    // ── Footer ──
    const footer = containerEl.createDiv("qc-settings-footer");
    footer.createEl("p", {
      text: "Quick Calculator v1.2.2 · © 2026 JPHsystems · MIT License",
      cls: "setting-item-description",
    });
    footer.createEl("p", {
      text: "github.com/jphermans/obsidian-quick-calculator",
      cls: "setting-item-description",
    });
  }
}
