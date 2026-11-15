import { getChatGPTUser } from "./chatgpt-auth";
import LegacyApp from "./legacy-app";
export const dynamic = "force-dynamic";
export default async function Home() {
  await getChatGPTUser();
  return <LegacyApp />;
}
