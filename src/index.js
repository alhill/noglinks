import { Hono } from 'hono';
import { getCookie, setCookie } from 'hono/cookie'
import crypto from 'crypto'
import jwt from 'jsonwebtoken'

const app = new Hono();

const authMiddleware = async (c, next) => {
  const token = getCookie(c, "auth_token")

  if (!token) {
    return c.redirect("/login");
  }

  try {
    const decoded = jwt.verify(token, c.env.SECRET);
    c.set("user", decoded);
    await next();
  } catch (err) {
    console.error(err)
    return c.redirect("/login");
  }
};

const fetchData = async c => {
  const paramList = [
    "headerText", "headerImg", "headerDescription", "links", "background", "seoTitle", "seoDescription", "seoKeywords",
    "favicon", "linkStyle", "containerStyle", "headInsert"
  ]
  const paramObj = {}
  for (const param of paramList) {
    const value = await c.env.KV.get(param)
    paramObj[param] = value || ""
  }
  return paramObj
}

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

app.get('/', async (c) => {

  const params = await fetchData(c)
  let links = []
  try{
    links = JSON.parse(params.links)
  } catch(err) {
    console.log(err)
  }

  return c.html(`
    <html>
      <head>
        <title>${params.seoTitle}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <meta name="title" content="${params.seoTitle}">
        <meta name="description" content="${params.seoDescription}">
        <meta name="keywords" content="${params.seoKeywords}">
        <meta name="author" content="Srta.Nognog">
        <meta property='og:title' content="${params.seoTitle} />
        <meta property='og:description' content="${params.seoDescription}" />
        <meta property='og:image' content="${params.headerImg}" />
        <meta property='og:url' content="https://links.srtanognog.com" />
        <meta property='og:type' content="website" />
        <link rel="icon" href="${params.favicon}">  
        <style>
          body{
            margin: 0;
            padding: 0;
            text-decoration: none;
            background: ${params.background};
            width: 100vw;
            overflow-x: hidden;
            display: flex;
            justify-content: center;
            align-items: center;
            flex-direction: column;
          }
          h1 {
            margin: 0;
            padding: 0;
            font-family: "Source Sans Pro", sans-serif;
            font-size: 2rem;
            color: #fff;
          }
          p {
            margin: 0;
            padding: 0;
            font-family: "Source Sans Pro", sans-serif;
            font-size: 1rem;
            color: #fff;
          } 
          a {
            font-family: "Source Sans Pro", sans-serif;
            font-size: 1rem;
            color: #fff;
            text-decoration: none;
          }
          ul {
            list-style-type: none;
            padding: 0;
            display: flex;
            flex-direction: column;
            gap: 1rem;
          }
          .link {
            ${params.linkStyle}
          }
          .container {
            ${params.containerStyle}
          }
          .headerImg {
            margin-top: 1rem;
            max-width: 100%;
            height: 150px;
            object-fit: contain;
            object-position: center;
          }
        </style>
        ${params.headInsert}
      <body>
        <div class="container">
          ${ params.headerImg ? `<img src="${params.headerImg}" class="headerImg" />` : "" }
          ${ params.headerText ? `<h1>${params.headerText}</h1>`: ""}
          ${ params.headerDescription ? `<p>${params.headerDescription}</p>` : "" }
          <ul>
            ${links.map(link => `<li class="link"><a href="${link.url}">${link.text}</a></li>`).join("")}
          </ul>
        </div>
      </body>
    </html>
  `);
});

app.get("/login", c => {
  return c.html(`
    <html>
      <body>
        <form method="POST">
          <label htmlFor="username" />
          <input id="user" name="user" />
          <br />
          <label htmlFor="password" />
          <input id="pw" type="password" name="pw" />
          <br />
          <button type="submit">Enviar</button>
        </form>
      </body>
    </html>
  `)
})

app.post("/login", async (c) => {
  const { user, pw } = await c.req.parseBody()

  const userKv = await c.env.KV.get("rootUser")
  const hashedKvPw = await c.env.KV.get("rootPw")

  const hash = crypto.createHmac("sha256", c.env.SECRET)
    .update(pw)
    .digest()
    .toString("hex") 

  if(hashedKvPw === hash && user === userKv){
    const payload = { user: userKv };
    const token = jwt.sign(payload, c.env.SECRET, { expiresIn: '2h' })

    setCookie(c, "auth_token", token, {
      httpOnly: true,   
      secure: true,    
      sameSite: "Strict", 
      path: "/",        
      maxAge: 3600,     
    });

    return c.redirect("/admin");
  } else {
    return c.redirect("/login");
  }
})

app.get("/admin", authMiddleware, async (c) => {

  const params = await fetchData(c)
  return c.html(`
    <html>
      <head>
        <style>
          textarea {
            font-type: monospace;
          }
          .field{
            display: flex;
            flex-direction: column;
            margin-bottom: 1rem;
          }
        </style>
      </head>
      <body>
        <button><a href="/logout">Cerrar sesión</a></button>
        <form method="POST" form="form">
          ${Object.keys(params).map(param => {
            if(param === "links") { return "" }
            return `
              <div class="field">
                <label htmlFor="${param}">${param}</label>
                <textarea id="${param}" name="${param}">${params[param]}</textarea>
              </div>
            `
          }).join("")}

          <label>Links</label>
          <button type="button" id="addLink">Añadir link</button>
          <div id="linksContainer"></div>
          <br />
          <button type="submit">Enviar</button>
      </body>
      <script>
        document.addEventListener("DOMContentLoaded", function () {
          const linksContainer = document.getElementById("linksContainer");
          const addLinkButton = document.getElementById("addLink");

          const links = ${params.links};
          try{
            Array(links.length).fill(null).forEach((_, index) => {
              addLink(links[index].text, links[index].url);
            })
          } catch(err) {
            console.log(err)
          }

          function updateNames() {
            document.querySelectorAll(".link-item").forEach((item, index) => {
              item.querySelector(".link-text").name = \`links-\${index}-text\`;
              item.querySelector(".link-url").name = \`links-\${index}-url\`;
            });
          }

          function addLink(text = "", url = "") {
            const div = document.createElement("div");
            div.classList.add("link-item");

            div.innerHTML = \`
              <input type="text" class="link-text" placeholder="Texto" value="\${text}">
              <input type="url" class="link-url" placeholder="URL" value="\${url}">
              <button type="button" class="remove">❌</button>
            \`;

            div.querySelector(".remove").addEventListener("click", () => {
              div.remove();
              updateNames();
            });

            linksContainer.appendChild(div);
            updateNames();
          }

          addLinkButton.addEventListener("click", () => addLink());
        });
      </script>
    </html>
  `)
});

app.post("/admin", authMiddleware, async c => {
  const body = await c.req.parseBody()

  const linkKeys = Object.keys(body).filter(k => k.startsWith("links-"))
  const links = linkKeys.reduce((acc, key) => {
    const [_, index, field] = key.split("-")
    if (!acc[index]) {
      acc[index] = {}
    }
    acc[index][field] = body[key]
    return acc
  }, [])

  for (const [key, value] of Object.entries(body)) {
    if(!key.startsWith("links-")) {
      await c.env.KV.put(key, value)
    }
    await c.env.KV.put("links", JSON.stringify(links))
    delay(50)
  }
  return c.redirect("/admin")
}) 

app.get("/logout", async c => {
  setCookie(c, "auth_token", "", {
    httpOnly: true,   
    secure: true,    
    sameSite: "Strict"
  })
  return c.redirect("/")
})

export default app;