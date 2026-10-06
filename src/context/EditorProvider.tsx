import { useReducer, type ReactNode } from "react";
import { EditorContext, editorReducer, initialState } from "./EditorContext";

export function EditorProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(editorReducer, initialState);

  return (
    <EditorContext.Provider value={{ state, dispatch }}>
      {children}
    </EditorContext.Provider>
  );
}
