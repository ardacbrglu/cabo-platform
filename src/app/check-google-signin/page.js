import dynamic from "next/dynamic";

const ClientCheck = dynamic(() => import("./ClientCheck"), {
  ssr: false,
});

export default function Page() {
  return <ClientCheck />;
}
