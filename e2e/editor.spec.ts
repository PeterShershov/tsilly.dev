import { test, expect, Page } from "@playwright/test";
import LZString from "lz-string";

async function setEditorValue(page: Page, testId: string, value: string) {
  // Find the editor container and use Monaco's API to set value
  await page.evaluate(
    ({ testId, value }) => {
      const container = document.querySelector(`[data-testid="${testId}"]`);
      if (!container) throw new Error(`Editor ${testId} not found`);
      // Monaco stores editor instance reference - find it through the DOM
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const monaco = (window as any).monaco;
      if (monaco) {
        const editors = monaco.editor.getEditors();
        for (const editor of editors) {
          if (editor.getContainerDomNode() === container) {
            editor.setValue(value);
            return;
          }
        }
      }
      throw new Error(`Monaco editor not found for ${testId}`);
    },
    { testId, value },
  );
}

test.describe("Tsilly Editor", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for Monaco editors to fully load
    await page.waitForSelector("[data-testid='editor-html']", {
      timeout: 15000,
    });
    await page.waitForSelector(".monaco-editor .view-lines", {
      timeout: 15000,
    });
    // Wait for Monaco global to be available
    await page.waitForFunction(
      () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
      {
        timeout: 15000,
      },
    );
  });

  test("HTML editing updates preview", async ({ page }) => {
    const iframe = page.frameLocator("iframe[title='Preview']");

    // Set HTML editor content
    await setEditorValue(
      page,
      "editor-html",
      '<div id="app"><h1>Test HTML Change</h1></div>',
    );

    // Verify preview updated
    await expect(iframe.locator("h1")).toContainText("Test HTML Change", {
      timeout: 5000,
    });
  });

  test("CSS editing updates preview", async ({ page }) => {
    const iframe = page.frameLocator("iframe[title='Preview']");

    // First set HTML with an h1 element
    await setEditorValue(page, "editor-html", "<h1>Styled Header</h1>");
    await expect(iframe.locator("h1")).toBeVisible({ timeout: 5000 });

    // Set CSS editor content
    await setEditorValue(page, "editor-css", "h1 { color: rgb(255, 0, 0); }");

    // Wait and check h1 color
    await page.waitForTimeout(500);
    const h1Color = await iframe.locator("h1").evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(h1Color).toBe("rgb(255, 0, 0)");
  });

  test("TypeScript editing updates preview", async ({ page }) => {
    const iframe = page.frameLocator("iframe[title='Preview']");

    // Set TypeScript editor content
    await setEditorValue(
      page,
      "editor-typescript",
      'document.body.innerHTML = "<p>TS Works</p>";',
    );

    // Verify preview updated
    await expect(iframe.locator("p")).toContainText("TS Works", {
      timeout: 5000,
    });
  });

  test("TypeScript error shows in preview", async ({ page }) => {
    const iframe = page.frameLocator("iframe[title='Preview']");

    // Set TypeScript editor content with syntax error
    await setEditorValue(page, "editor-typescript", "const x: number = ;");

    // Check for compilation error in preview
    await expect(iframe.locator("text=Compilation Error")).toBeVisible({
      timeout: 5000,
    });
  });

  test("share button copies URL and loads shared workspace", async ({
    page,
    context,
  }) => {
    // Grant clipboard permissions
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);

    // Set custom content in the editors
    await setEditorValue(
      page,
      "editor-html",
      '<div id="app"><h1>Shared Test</h1></div>',
    );
    await setEditorValue(page, "editor-css", "h1 { color: rgb(0, 128, 0); }");
    await setEditorValue(page, "editor-typescript", 'console.log("shared");');

    // Click the share button
    const shareButton = page.getByTitle("Share");
    await shareButton.click();

    // Wait for the "Copied!" state
    await expect(page.getByTitle("Copied!")).toBeVisible({ timeout: 2000 });

    // Get the copied URL from clipboard
    const clipboardText = await page.evaluate(() =>
      navigator.clipboard.readText(),
    );
    expect(clipboardText).toContain("?code=");

    // Open a new page with the shared URL
    const newPage = await context.newPage();
    await newPage.goto(clipboardText);
    await newPage.waitForSelector("[data-testid='editor-html']", {
      timeout: 15000,
    });
    await newPage.waitForSelector(".monaco-editor .view-lines", {
      timeout: 15000,
    });
    await newPage.waitForFunction(
      () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
      {
        timeout: 15000,
      },
    );

    // Verify the shared content is loaded in the preview
    const iframe = newPage.frameLocator("iframe[title='Preview']");
    await expect(iframe.locator("h1")).toContainText("Shared Test", {
      timeout: 5000,
    });

    // Verify CSS is applied
    const h1Color = await iframe.locator("h1").evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(h1Color).toBe("rgb(0, 128, 0)");

    await newPage.close();
  });

  test("direct URL navigation loads workspace correctly", async ({ page }) => {
    // Create a workspace and encode it
    const workspace = {
      html: "<h1>Direct URL Test</h1>",
      css: "h1 { color: rgb(0, 0, 255); }",
      typescript: 'console.log("url loaded");',
    };
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify(workspace),
    );
    const urlWithCode = `http://localhost:5173/?code=${encoded}`;

    // Navigate directly to the URL with the code parameter
    await page.goto(urlWithCode);
    await page.waitForSelector("[data-testid='editor-html']", {
      timeout: 15000,
    });
    await page.waitForSelector(".monaco-editor .view-lines", {
      timeout: 15000,
    });
    await page.waitForFunction(
      () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
      { timeout: 15000 },
    );

    // Verify the content is loaded in the preview
    const iframe = page.frameLocator("iframe[title='Preview']");
    await expect(iframe.locator("h1")).toContainText("Direct URL Test", {
      timeout: 5000,
    });

    // Verify CSS is applied
    const h1Color = await iframe.locator("h1").evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(h1Color).toBe("rgb(0, 0, 255)");
  });

  test("save button updates URL with current state", async ({ page }) => {
    // Set custom content in the editors
    await setEditorValue(page, "editor-html", "<h1>Save URL Test</h1>");
    await setEditorValue(page, "editor-css", "h1 { font-size: 24px; }");
    await setEditorValue(page, "editor-typescript", 'const x = "saved";');

    // Get initial URL (should not have code param)
    const initialUrl = page.url();
    expect(initialUrl).not.toContain("?code=");

    // Click the save button using data-testid
    const saveButton = page.locator('[data-testid="save-button"]');
    await expect(saveButton).toBeVisible({ timeout: 5000 });
    await saveButton.click();

    // Wait for the "Saved!" state
    await expect(
      page.locator('[data-testid="save-button"][title="Saved!"]'),
    ).toBeVisible({ timeout: 3000 });

    // Verify URL now contains the code parameter
    await page.waitForFunction(() => window.location.href.includes("?code="), {
      timeout: 3000,
    });
    const newUrl = page.url();
    expect(newUrl).toContain("?code=");

    // Decode and verify the URL contains our content
    const urlObj = new URL(newUrl);
    const encoded = urlObj.searchParams.get("code");
    expect(encoded).not.toBeNull();

    const decoded = JSON.parse(
      LZString.decompressFromEncodedURIComponent(encoded!) || "{}",
    );
    expect(decoded.html).toBe("<h1>Save URL Test</h1>");
    expect(decoded.css).toBe("h1 { font-size: 24px; }");
    expect(decoded.typescript).toBe('const x = "saved";');
  });

  test("refreshing page with URL preserves state", async ({ page }) => {
    // Create a workspace and encode it
    const workspace = {
      html: "<h1>Refresh Test</h1>",
      css: "h1 { color: rgb(128, 0, 128); }",
      typescript: "",
    };
    const encoded = LZString.compressToEncodedURIComponent(
      JSON.stringify(workspace),
    );
    const urlWithCode = `http://localhost:5173/?code=${encoded}`;

    // Navigate to the URL
    await page.goto(urlWithCode);
    await page.waitForSelector("[data-testid='editor-html']", {
      timeout: 15000,
    });
    await page.waitForSelector(".monaco-editor .view-lines", {
      timeout: 15000,
    });
    await page.waitForFunction(
      () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
      { timeout: 15000 },
    );

    // Verify content loaded
    let iframe = page.frameLocator("iframe[title='Preview']");
    await expect(iframe.locator("h1")).toContainText("Refresh Test", {
      timeout: 5000,
    });

    // Refresh the page
    await page.reload();
    await page.waitForSelector("[data-testid='editor-html']", {
      timeout: 15000,
    });
    await page.waitForSelector(".monaco-editor .view-lines", {
      timeout: 15000,
    });
    await page.waitForFunction(
      () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
      { timeout: 15000 },
    );

    // Re-create iframe locator after reload
    iframe = page.frameLocator("iframe[title='Preview']");

    // Verify content is still there (loaded from URL which is preserved)
    await expect(iframe.locator("h1")).toContainText("Refresh Test", {
      timeout: 5000,
    });

    // Verify CSS is still applied
    const h1Color = await iframe.locator("h1").evaluate((el) => {
      return window.getComputedStyle(el).color;
    });
    expect(h1Color).toBe("rgb(128, 0, 128)");
  });

  test("cursor position is preserved when typing with pauses", async ({
    page,
  }) => {
    // Click into the CSS editor to focus it
    const cssEditor = page.locator("[data-testid='editor-css']");
    await cssEditor.click();

    // Wait for editor to be ready
    await page.waitForTimeout(200);

    // Type some text (avoid special chars that trigger auto-complete)
    await page.keyboard.type("hello");

    // Wait a bit (simulating user pause - longer than debounce)
    await page.waitForTimeout(1500);

    // Type more text - cursor should continue from where it was
    await page.keyboard.type(" world");

    // Ensure Monaco is available before reading the editor content
    await page.waitForFunction(
      () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
      { timeout: 15000 },
    );

    // Get the editor content
    const content = await page.evaluate(() => {
      const monaco = (window as any).monaco;
      const editors = monaco?.editor?.getEditors() ?? [];
      for (const editor of editors) {
        if (editor.getContainerDomNode().dataset.testid === "editor-css") {
          return editor.getValue();
        }
      }
      return null;
    });

    // If cursor jumped to start, content would be " worldhello" instead of "hello world"
    expect(content).toBe("hello world");
  });

  test.describe("Console Errors", () => {
    test("shows error message for thrown errors", async ({ page }) => {
      // Set code that throws an error
      await setEditorValue(
        page,
        "editor-typescript",
        "throw new Error('test error message')",
      );

      // Wait for console to show the error
      const consolePanel = page.locator("text=test error message");
      await expect(consolePanel).toBeVisible({ timeout: 5000 });
    });

    test("shows ReferenceError for undefined variables", async ({ page }) => {
      // Set code that references an undefined variable
      await setEditorValue(page, "editor-typescript", "nonExistentVariable123");

      // Wait for console to show the ReferenceError
      const consoleError = page.locator("text=nonExistentVariable123");
      await expect(consoleError).toBeVisible({ timeout: 5000 });
    });

    test("shows multiple errors from separate execution contexts", async ({
      page,
    }) => {
      // Use setTimeout so each error fires independently
      await setEditorValue(
        page,
        "editor-typescript",
        `setTimeout(() => { throw new Error('first error') }, 0)
setTimeout(() => { throw new Error('second error') }, 50)`,
      );

      // Both errors should appear in the console
      await expect(page.locator("text=first error")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("text=second error")).toBeVisible({
        timeout: 5000,
      });
    });

    test("shows multiple console.error calls", async ({ page }) => {
      await setEditorValue(
        page,
        "editor-typescript",
        `console.error('error one')
console.error('error two')
console.error('error three')`,
      );

      await expect(page.locator("text=error one")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("text=error two")).toBeVisible({
        timeout: 5000,
      });
      await expect(page.locator("text=error three")).toBeVisible({
        timeout: 5000,
      });
    });
  });

  test.describe("Layout Dropdown", () => {
    test("opens dropdown and shows all layout options", async ({ page }) => {
      // Click the layout button
      const layoutButton = page.getByTitle("Layout");
      await layoutButton.click();

      // Verify dropdown is visible with all options
      await expect(
        page.getByRole("button", { name: "Vertical" }),
      ).toBeVisible();
      await expect(page.getByRole("button", { name: "Stacked" })).toBeVisible();
      await expect(page.getByRole("button", { name: "Sidebar" })).toBeVisible();
    });

    test("closes dropdown when clicking outside", async ({ page }) => {
      // Open dropdown
      const layoutButton = page.getByTitle("Layout");
      await layoutButton.click();
      await expect(
        page.getByRole("button", { name: "Vertical" }),
      ).toBeVisible();

      // Click outside
      await page.locator("body").click({ position: { x: 10, y: 10 } });

      // Verify dropdown is closed
      await expect(
        page.getByRole("button", { name: "Vertical" }),
      ).not.toBeVisible();
    });

    test("selecting Stacked layout changes panel arrangement", async ({
      page,
    }) => {
      // Open dropdown and select Stacked
      await page.getByTitle("Layout").click();
      await page.getByRole("button", { name: "Stacked" }).click();

      // Verify dropdown closed
      await expect(
        page.getByRole("button", { name: "Stacked" }),
      ).not.toBeVisible();

      // Verify layout changed by checking localStorage
      const savedLayout = await page.evaluate(() =>
        localStorage.getItem("tsilly-layout"),
      );
      expect(savedLayout).toBe('"stacked"');

      // Re-open dropdown and verify Stacked is now highlighted
      await page.getByTitle("Layout").click();
      const stackedButton = page.getByRole("button", { name: "Stacked" });
      await expect(stackedButton).toHaveClass(/bg-\[#0e639c\]/);
    });

    test("selecting Sidebar layout changes panel arrangement", async ({
      page,
    }) => {
      // Open dropdown and select Sidebar
      await page.getByTitle("Layout").click();
      await page.getByRole("button", { name: "Sidebar" }).click();

      // Verify dropdown closed
      await expect(
        page.getByRole("button", { name: "Sidebar" }),
      ).not.toBeVisible();

      // Verify layout changed by checking localStorage
      const savedLayout = await page.evaluate(() =>
        localStorage.getItem("tsilly-layout"),
      );
      expect(savedLayout).toBe('"sidebar"');

      // Re-open dropdown and verify Sidebar is now highlighted
      await page.getByTitle("Layout").click();
      const sidebarButton = page.getByRole("button", { name: "Sidebar" });
      await expect(sidebarButton).toHaveClass(/bg-\[#0e639c\]/);
    });

    test("selecting Vertical layout shows all panels side by side", async ({
      page,
    }) => {
      // First switch to Stacked, then back to Vertical
      await page.getByTitle("Layout").click();
      await page.getByRole("button", { name: "Stacked" }).click();
      await page.waitForTimeout(200);

      // Now switch to Vertical
      await page.getByTitle("Layout").click();
      await page.getByRole("button", { name: "Vertical" }).click();

      // Verify dropdown closed
      await expect(
        page.getByRole("button", { name: "Vertical" }),
      ).not.toBeVisible();

      // Verify layout changed by checking localStorage
      const savedLayout = await page.evaluate(() =>
        localStorage.getItem("tsilly-layout"),
      );
      expect(savedLayout).toBe('"vertical"');
    });

    test("layout choice persists after page refresh", async ({ page }) => {
      // Clear localStorage first
      await page.evaluate(() => localStorage.removeItem("tsilly-layout"));
      await page.reload();
      await page.waitForSelector("[data-testid='editor-html']", {
        timeout: 15000,
      });
      await page.waitForFunction(
        () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
        {
          timeout: 15000,
        },
      );

      // Select Stacked layout
      await page.getByTitle("Layout").click();
      await page.getByRole("button", { name: "Stacked" }).click();
      await page.waitForTimeout(300);

      // Verify localStorage has the layout
      const savedLayout = await page.evaluate(() =>
        localStorage.getItem("tsilly-layout"),
      );
      expect(savedLayout).toBe('"stacked"');

      // Reload the page
      await page.reload();
      await page.waitForSelector("[data-testid='editor-html']", {
        timeout: 15000,
      });
      await page.waitForFunction(
        () => (window as any).monaco?.editor?.getEditors()?.length >= 3,
        {
          timeout: 15000,
        },
      );

      // Verify the layout is still Stacked by opening dropdown and checking highlighted option
      await page.getByTitle("Layout").click();
      const stackedButton = page.getByRole("button", { name: "Stacked" });
      await expect(stackedButton).toHaveClass(/bg-\[#0e639c\]/);

      // Clean up
      await page.evaluate(() => localStorage.removeItem("tsilly-layout"));
    });

    test("highlights currently selected layout option", async ({ page }) => {
      // Default should be Vertical - open dropdown and check
      await page.getByTitle("Layout").click();

      // Vertical should have the selected style (bg-[#0e639c])
      const verticalButton = page.getByRole("button", { name: "Vertical" });
      await expect(verticalButton).toHaveClass(/bg-\[#0e639c\]/);

      // Close and switch to Stacked
      await page.getByRole("button", { name: "Stacked" }).click();
      await page.waitForTimeout(200);

      // Open dropdown again
      await page.getByTitle("Layout").click();

      // Now Stacked should be highlighted
      const stackedButton = page.getByRole("button", { name: "Stacked" });
      await expect(stackedButton).toHaveClass(/bg-\[#0e639c\]/);

      // Vertical should not be highlighted
      await expect(verticalButton).not.toHaveClass(/bg-\[#0e639c\]/);
    });
  });
});
