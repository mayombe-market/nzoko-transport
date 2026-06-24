import React from "./html.js";
import { createRoot } from "react-dom/client";
import { App } from "./app.js";

const rootEl = document.getElementById("root");
rootEl.innerHTML = "";
createRoot(rootEl).render(React.createElement(App));
