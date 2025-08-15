// src/app/api/auth/[...nextauth]/route.js
import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
