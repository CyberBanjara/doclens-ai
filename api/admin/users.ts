import { createApp } from "h3";
import { toNodeHandler } from "h3/node";
import handler from "../../server/api/admin/users.get";

const app = createApp().use(handler);

export default toNodeHandler(app);
