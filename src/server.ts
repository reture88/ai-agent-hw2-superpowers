import { createApp } from "./app";

const PORT = Number(process.env.PORT ?? 3000);

const app = createApp();

app.listen(PORT, () => {
  console.log(`Customer geo-distance service listening on port ${PORT}`);
});
