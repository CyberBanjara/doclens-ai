import { toNodeHandler } from "h3/node";
import handler from "../../server/api/admin/update-user-role.post";

export default toNodeHandler(handler);
