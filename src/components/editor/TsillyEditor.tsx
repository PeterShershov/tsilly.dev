import "allotment/dist/style.css";
import { useCallback, useEffect, useRef, useState } from "react";
import { useEditor, initialState } from "~/context/EditorContext";
import { EditorProvider } from "~/context/EditorProvider";
import { SaveContext, type SaveContextValue } from "~/context/SaveContext";
import { useDebouncedLocalStorage } from "~/hooks/useLocalStorage";
import { getWorkspaceFromUrl, getShareUrl } from "~/lib/share";
import type { Layout } from "~/types/editor";
import { ConsoleDrawer } from "./ConsoleDrawer";
import { EditorHeader } from "./EditorHeader";
import { EditorPanels } from "./EditorPanels";
import { LoadingOverlay } from "./LoadingOverlay";
import type { TypeScriptConfig } from "~/types/editor";

interface SavedState {
  html: string;
  css: string;
  typescript: string;
  tsConfig?: TypeScriptConfig;
}

const EXPECTED_EDITORS = 3; // HTML, CSS, TypeScript
const MIN_LOADING_TIME = 500;

function EditorWithPersistence() {
  const { state, dispatch } = useEditor();
  const loadedFromUrl = useRef(false);
  const [loading, setLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [sharedWorkspace] = useState(getWorkspaceFromUrl);
  // A workspace loaded from the URL counts as the "saved" state
  const [lastSavedState, setLastSavedState] = useState<{ html: string; css: string; typescript: string } | null>(() =>
    sharedWorkspace
      ? {
          html: sharedWorkspace.html ?? "",
          css: sharedWorkspace.css ?? "",
          typescript: sharedWorkspace.typescript ?? "",
        }
      : null,
  );
  const editorsReadyCount = useRef(0);
  const editorsReady = useRef(false);
  const minTimeElapsed = useRef(false);
  const initialLoadDone = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      minTimeElapsed.current = true;
      if (editorsReady.current) {
        setLoading(false);
      }
    }, MIN_LOADING_TIME);
    return () => clearTimeout(timer);
  }, []);

  const handleEditorReady = useCallback(() => {
    editorsReadyCount.current += 1;
    if (editorsReadyCount.current >= EXPECTED_EDITORS) {
      editorsReady.current = true;
      if (minTimeElapsed.current) {
        setLoading(false);
      }
    }
  }, []);

  const [savedState, setSavedState, flushStorage] =
    useDebouncedLocalStorage<SavedState>(
      "tsilly-code",
      {
        html: initialState.html,
        css: initialState.css,
        typescript: initialState.typescript,
        tsConfig: initialState.tsConfig,
      },
      200,
    );

  // Load layout synchronously to avoid flash
  const [initialLayout] = useState<Layout>(() => {
    try {
      const item = window.localStorage.getItem("tsilly-layout");
      if (item) {
        return JSON.parse(item) as Layout;
      }
    } catch (error) {
      console.warn('Error reading layout from localStorage:', error);
    }
    return initialState.layout;
  });
  const savedLayout = useRef(initialLayout);

  useEffect(() => {
    // First, check if there's a shared workspace in the URL
    if (sharedWorkspace) {
      loadedFromUrl.current = true;
      dispatch({ type: "LOAD_STATE", payload: sharedWorkspace });
      // Don't clear URL - keep it for bookmarking/refreshing
      // Set initialLoadDone after a microtask to ensure state is applied
      queueMicrotask(() => {
        initialLoadDone.current = true;
      });
      return;
    }

    // Otherwise, load from localStorage
    const hasChanges =
      savedState.html !== initialState.html ||
      savedState.css !== initialState.css ||
      savedState.typescript !== initialState.typescript ||
      savedState.tsConfig;
    if (hasChanges) {
      dispatch({ type: "LOAD_STATE", payload: savedState });
    }
    // Delay to prevent saving initial state before loaded state is applied
    queueMicrotask(() => {
      initialLoadDone.current = true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load layout on mount
  useEffect(() => {
    if (initialLayout !== state.layout) {
      dispatch({ type: "SET_LAYOUT", payload: initialLayout });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Save layout when it changes
  useEffect(() => {
    if (state.layout !== savedLayout.current) {
      savedLayout.current = state.layout;
      try {
        window.localStorage.setItem("tsilly-layout", JSON.stringify(state.layout));
      } catch (error) {
        console.warn('Error saving layout to localStorage:', error);
      }
    }
  }, [state.layout]);

  useEffect(() => {
    if (!initialLoadDone.current) return;

    const newState = {
      html: state.html,
      css: state.css,
      typescript: state.typescript,
      tsConfig: state.tsConfig,
    };
    setSavedState(newState);
  }, [state.html, state.css, state.typescript, state.tsConfig, setSavedState]);

  const saveNow = useCallback(async () => {
    setIsSaving(true);
    const workspace = {
      html: state.html,
      css: state.css,
      typescript: state.typescript,
    };

    flushStorage();

    const shareUrl = getShareUrl(workspace);
    window.history.replaceState({}, "", shareUrl);

    // Mark current state as saved
    setLastSavedState(workspace);

    await new Promise((resolve) => setTimeout(resolve, 300));
    setIsSaving(false);
  }, [state.html, state.css, state.typescript, flushStorage]);

  const hasUnsavedChanges = lastSavedState !== null && (
    state.html !== lastSavedState.html ||
    state.css !== lastSavedState.css ||
    state.typescript !== lastSavedState.typescript
  );

  // Warn user before leaving if there are unsaved changes
  useEffect(() => {
    if (!hasUnsavedChanges) return;

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Modern browsers ignore custom messages, but we need to return something
      return "You have unsaved changes. Are you sure you want to leave?";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasUnsavedChanges]);

  const saveContextValue: SaveContextValue = { saveNow, isSaving, hasUnsavedChanges };

  return (
    <SaveContext.Provider value={saveContextValue}>
      <div className="flex flex-col h-screen bg-[#1e1e1e] relative">
        <LoadingOverlay visible={loading} />
        <EditorHeader />
        <div className="flex-1 min-h-0 bg-[#1e1e1e]">
          <EditorPanels onEditorReady={handleEditorReady} />
        </div>
        <ConsoleDrawer />
      </div>
    </SaveContext.Provider>
  );
}

export function TsillyEditor() {
  return (
    <EditorProvider>
      <EditorWithPersistence />
    </EditorProvider>
  );
}
