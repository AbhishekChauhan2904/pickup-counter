import { createRoot } from "react-dom/client";
import App from "./App";
// @ts-expect-error The bundler resolves this CSS side-effect import.
import "./style.css";
createRoot(document.getElementById("root")!).render(<App />);
