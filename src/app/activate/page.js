//activate/page.js
import ActivatedPage from '@/app/Activated/page';
import ContentWrapper from './Content';

export const metadata = {
  title: "Account Activation - Cabo",
  description: "Your account activation status.",
};

export default function ActivatePage() {
  return (
    <ContentWrapper>
      <ActivatedPage />
    </ContentWrapper>
  );
}
