// Configuration de React + htm (JSX-like sans étape de build)
import React from "react";
import htm from "htm";

export const html = htm.bind(React.createElement);
export const {
  useState,
  useEffect,
  useMemo,
  useRef,
  useCallback,
  useContext,
  createContext,
  Fragment,
} = React;
export default React;
