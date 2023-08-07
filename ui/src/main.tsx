import { render } from "preact";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { Ad4minProvider } from "./context/Ad4minContext";
import { BrowserRouter as Router } from "react-router-dom";
import "@fluxapp/ui";
import "@fluxapp/ui/dist/main.css";
import "./index.css";

const Main = () => {
  return (
    <Ad4minProvider>
      <Router>
        <App />
      </Router>
    </Ad4minProvider>
  );
};

render(<Main />, document.getElementById("root")!);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
