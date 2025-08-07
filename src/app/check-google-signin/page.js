export const dynamic = "force-dynamic";

import dynamic from "next/dynamic";

// Client bileşeni ayrı dosyaya alıyoruz
const ClientCheck = dynamic(() => import("./ClientCheck"), {
  ssr: false,
});

export default function Page() {
  return <ClientCheck />;
}
