import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "./page";

const root = document.getElementById("root");
if (root) createRoot(root).render(<StrictMode><Home /></StrictMode>);
