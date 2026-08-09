import { toNodeHandler } from "h3/node";
import handler from "../../server/api/admin/users.get";

export default toNodeHandler(handler);
