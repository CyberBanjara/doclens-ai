import { createApp } from "h3";
import { toNodeHandler } from "h3/node";
import handler from "../../server/api/admin/update-user-role.post";

const app = createApp().use(handler);

export default toNodeHandler(app);
