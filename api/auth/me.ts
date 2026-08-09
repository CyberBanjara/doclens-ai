import { toNodeHandler } from "h3/node";
import handler from "../../server/api/auth/me.get";

export default toNodeHandler(handler);
