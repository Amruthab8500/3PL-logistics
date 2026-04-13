import { render, screen } from "@testing-library/react";
import App from "./App";

describe("portal routing", () => {
  it("shows only the public inquiry form when staff flag is absent", () => {
    window.history.pushState({}, "", "/");
    render(<App />);
    expect(screen.getByText(/STYLE ASIA 3PL CLIENT INQUIRY FORM/i)).toBeInTheDocument();
    expect(screen.queryByText(/Style Asia 3PL Intake Hub/i)).not.toBeInTheDocument();
  });

  it("shows staff intake hub when ?staff=1", () => {
    window.history.pushState({}, "", "/?staff=1");
    render(<App />);
    expect(screen.getByText(/Style Asia 3PL Intake Hub/i)).toBeInTheDocument();
    expect(screen.queryByText(/STYLE ASIA 3PL CLIENT INQUIRY FORM/i)).not.toBeInTheDocument();
  });
});
