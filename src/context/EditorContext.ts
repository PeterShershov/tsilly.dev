import { createContext, useContext } from "react";
import type {
  EditorState,
  EditorAction,
  TypeScriptConfig,
} from "~/types/editor";

const DEFAULT_HTML = ``;

const DEFAULT_CSS = ``;

const DEFAULT_TYPESCRIPT = ``;

const DEFAULT_TS_CONFIG: TypeScriptConfig = {
  jsx: "none",
  jsxImportSource: "react",
  jsxFactory: "React.createElement",
  jsxFragmentFactory: "React.Fragment",
  target: "esnext",
};

export const initialState: EditorState = {
  html: DEFAULT_HTML,
  css: DEFAULT_CSS,
  typescript: DEFAULT_TYPESCRIPT,
  compiledJs: "",
  compilationError: null,
  panels: {
    html: true,
    css: true,
    typescript: true,
    preview: true,
  },
  consoleOpen: true,
  consoleLogs: [],
  tsConfig: DEFAULT_TS_CONFIG,
  runCounter: 0,
  layout: "vertical",
};

export function editorReducer(state: EditorState, action: EditorAction): EditorState {
  switch (action.type) {
    case "SET_HTML":
      return { ...state, html: action.payload };
    case "SET_CSS":
      return { ...state, css: action.payload };
    case "SET_TYPESCRIPT":
      return { ...state, typescript: action.payload };
    case "SET_COMPILED_JS":
      return {
        ...state,
        compiledJs: action.payload,
        compilationError: action.error ?? null,
      };
    case "TOGGLE_PANEL":
      return {
        ...state,
        panels: {
          ...state.panels,
          [action.payload]: !state.panels[action.payload],
        },
      };
    case "TOGGLE_CONSOLE":
      return { ...state, consoleOpen: !state.consoleOpen };
    case "ADD_CONSOLE_LOG":
      return {
        ...state,
        consoleLogs: [...state.consoleLogs, action.payload],
      };
    case "CLEAR_CONSOLE":
      return { ...state, consoleLogs: [] };
    case "LOAD_STATE":
      return { ...state, ...action.payload };
    case "UPDATE_TS_CONFIG":
      return { ...state, tsConfig: { ...state.tsConfig, ...action.payload } };
    case "RUN":
      return { ...state, runCounter: state.runCounter + 1 };
    case "SET_LAYOUT":
      return { ...state, layout: action.payload };
    default:
      return state;
  }
}

interface EditorContextValue {
  state: EditorState;
  dispatch: React.Dispatch<EditorAction>;
}

export const EditorContext = createContext<EditorContextValue | null>(null);

export function useEditor() {
  const context = useContext(EditorContext);
  if (!context) {
    throw new Error("useEditor must be used within an EditorProvider");
  }
  return context;
}
