import "@pyreon/zero-content/blog.css"
import "./global.css"
import "virtual:zero-content/collections"
import { routes } from "virtual:zero/routes"
import { startClient } from "@pyreon/zero/client"

startClient({ routes })
