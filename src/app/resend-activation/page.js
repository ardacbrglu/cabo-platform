// ✅ FILE: src/app/resend-activation/page.js
import React from "react";
import ResendActivationContent from "./ResendActivationContent";
import ContentWrapper from "../activate/Content"; // Locale check

export const metadata = {
  title: "Resend Activation - Cabo",
  description: "Request a new activation link.",
};

export default function ResendActivationPage() {
  return (
    <ContentWrapper>
      <ResendActivationContent />
    </ContentWrapper>
  );
}
