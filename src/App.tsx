import { HashRouter, Routes, Route } from "react-router-dom";
import { HomePage } from "@/components/HomePage";
import { Layout } from "@/components/Layout";
import { PromptModal } from "@/components/common/PromptModal";
import { LoginGate } from "@/components/common/LoginGate";

export default function App() {
  return (
    <LoginGate>
      <HashRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/editor" element={<Layout />} />
        </Routes>
        <PromptModal />
      </HashRouter>
    </LoginGate>
  );
}
