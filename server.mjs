// Local/dev runner (stateful)
import app from "./src/app.mjs";

const PORT = Number(process.env.PORT ?? 4000);
app.listen(PORT, () => {
  console.log(`Local API http://localhost:${PORT}`);
});
