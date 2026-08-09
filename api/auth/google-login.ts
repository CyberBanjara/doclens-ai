import { toNodeHandler } from "h3/node";
import handler from "../../server/api/auth/google-login.post";

export default toNodeHandler(handler);
