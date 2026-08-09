import { toNodeHandler } from "h3/node";
import handler from "../../server/api/auth/logout.post";

export default toNodeHandler(handler);
