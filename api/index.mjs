// Vercel Node function wrapper (optional)
import app from "../src/app.mjs";

export default function handler(req, res) {
  return app(req, res);
}

export const config = {
  maxDuration: 10,
  memory: 256
};
