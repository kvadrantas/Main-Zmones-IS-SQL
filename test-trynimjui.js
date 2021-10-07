import express from "express";
import exphbs from "express-handlebars";
import { commit, connect, end, query, rollback, start } from "./db.js";

const PORT = 3000;
const WEB = "web";

const app = express();

app.engine(
  "handlebars",
  exphbs({
    helpers: {
      dateFormat: (date) => {
        if (date instanceof Date) {
          let year = "0000" + date.getFullYear();
          year = year.substr(-4);
          let month = "00" + (date.getMonth() + 1);
          month = month.substr(-2);
          let day = "00" + date.getDate();
          day = day.substr(-2);
          return `${year}-${month}-${day}`;
        }
        return date;
      },
      eq: (param1, param2) => {
        return param1 === param2;
      },
      nullTo0: (num) => {
        if (num === undefined || num === null) {
          return "0";
        }
        return num;
      },
    },
  }),
);
app.set("view engine", "handlebars");

app.use(express.static(WEB, {
  index: ["index.html"],
}));
app.use(express.json());
app.use(express.urlencoded({
  extended: true,
}));

app.get("/cekiai", async (req, res) => {
  let conn;
  try {
    conn = await connect();
    const { results: cekiai } = await query(
      conn,
      `
    select
      id, data, parduotuve
    from cekiai
    order by
      data, parduotuve`,
    );
    res.render("cekiai", { cekiai });
  } catch (err) {
    res.render("klaida", { err });
  } finally {
    await end(conn);
  }
});

app.get("/cekis/:id?", async (req, res) => {
  // tikrinam ar yra perduotas id parametras
  if (req.params.id) {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      let conn;
      try {
        conn = await connect();
        const { results: cekiai } = await query(
          conn,
          `
          select
            id, data, parduotuve
          from cekiai
          where id = ?`,
          [id],
        );
        if (cekiai.length > 0) {
          // siame sarase yra VIENAS irasas (tas kurio mes ir ieskojom)
          // generuojam forma su tuo irasu
          const { results: prekes } = await query(
            conn,
            `
            select
              prekes.id,
              preke,
              kiekis,
              kaina,
              tipai.pavadinimas as tipas
            from prekes left join tipai on prekes.tipai_id = tipai.id
            where cekiai_id = ?
            order by preke`,
            [cekiai[0].id],
          );
          res.render("cekis", { cekis: cekiai[0], prekes });
        } else {
          // cekis su nurodytu id nerastas
          res.redirect("/cekiai");
        }
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      // padave id ne skaiciu - dabar siunciam i cekiu sarasa
      // o galim parodyt klaidos forma
      res.redirect("/cekiai");
    }
  } else {
    // Naujo cekio ivedimas
    res.render("cekis");
  }
});

app.post("/cekis", async (req, res) => {
  if (req.body.id) {
    // update esama ceki
    const id = parseInt(req.body.id);
    if (
      !isNaN(id) &&
      isFinite((new Date(req.body.data)).getTime()) &&
      typeof req.body.parduotuve === "string" &&
      req.body.parduotuve.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await start(conn);
        await query(
          conn,
          `
          update cekiai
          set data = ? , parduotuve = ?
          where id = ?`,
          [new Date(req.body.data), req.body.parduotuve, id],
        );
        await commit(conn);
      } catch (err) {
        await rollback(conn);
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else {
    // insert nauja ceki
    if (
      isFinite((new Date(req.body.data)).getTime()) &&
      typeof req.body.parduotuve === "string" &&
      req.body.parduotuve.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await start(conn);
        await query(
          conn,
          `
          insert into cekiai (data, parduotuve)
          values (?, ?)`,
          [new Date(req.body.data), req.body.parduotuve],
        );
        await commit(conn);
      } catch (err) {
        await rollback(conn);
        // ivyko klaida irasant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  }
  res.redirect("/cekiai");
});

app.get("/cekis/:id/del", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isNaN(id)) {
    let conn;
    try {
      conn = await connect();
      await start(conn);
      await query(
        conn,
        `
          delete from cekiai
          where id = ?`,
        [id],
      );
      await commit(conn);
    } catch (err) {
      await rollback(conn);
      // ivyko klaida gaunant duomenis
      res.render("klaida", { err });
      return;
    } finally {
      await end(conn);
    }
  }
  res.redirect("/cekiai");
});

app.get("/preke/:id?", async (req, res) => {
  // tikrinam ar yra perduotas id parametras
  if (req.params.id) {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      let conn;
      try {
        conn = await connect();
        const { results: prekes } = await query(
          conn,
          `
          select
            prekes.id, cekiai_id as cekisId, preke, kiekis, kaina, tipai_id as tipas
          from prekes
          where id = ?`,
          [id],
        );
        if (prekes.length > 0) {
          const { results: tipai } = await query(
            conn,
            `
          select
            id, pavadinimas
          from tipai
          order by
            pavadinimas`,
          );
          // siame sarase yra VIENAS irasas (tas kurio mes ir ieskojom)
          // generuojam forma su tuo irasu
          res.render("preke", { preke: prekes[0], tipai });
        } else {
          // preke su nurodytu id nerasta
          res.redirect("/cekiai");
        }
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      // padave id ne skaiciu - dabar siunciam i cekiu sarasa
      // o galim parodyt klaidos forma
      res.redirect("/cekiai");
    }
  } else if (req.query.cekisId) {
    const cekisId = parseInt(req.query.cekisId);
    if (!isNaN(cekisId)) {
      // Naujos prekes ivedimas
      let conn;
      try {
        conn = await connect();
        const { results: tipai } = await query(
          conn,
          `
        select
          id, pavadinimas
        from tipai
        order by
          pavadinimas`,
        );
        res.render("preke", { tipai, cekisId });
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      res.redirect("/cekiai");
    }
  }
});

app.post("/preke", async (req, res) => {
  const cekisId = parseInt(req.body.cekisId);
  const preke = req.body.preke;
  const kiekis = parseFloat(req.body.kiekis);
  const kaina = parseFloat(req.body.kaina);
  const tipas = parseInt(req.body.tipas);
  if (req.body.id) {
    // preke update
    const id = parseInt(req.body.id);
    if (
      !isNaN(id) &&
      typeof preke === "string" && preke.trim() !== "" &&
      isFinite(kiekis) && kiekis > 0 &&
      isFinite(kaina) && kaina > 0 &&
      isFinite(tipas)
    ) {
      let conn;
      try {
        conn = await connect();
        await start(conn);
        await query(
          conn,
          `
          update prekes
          set preke = ?, kiekis = ?, kaina = ?, tipai_id = ?
          where id = ?`,
          [preke, kiekis, kaina, tipas, id],
        );
        await commit(conn);
      } catch (err) {
        await rollback(conn);
        // ivyko klaida keiciant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else if (req.body.cekisId) {
    // insert preke
    if (
      !isNaN(cekisId) &&
      typeof preke === "string" && preke.trim() !== "" &&
      isFinite(kiekis) && kiekis > 0 &&
      isFinite(kaina) && kaina > 0 &&
      isFinite(tipas)
    ) {
      let conn;
      try {
        conn = await connect();
        await start(conn);
        await query(
          conn,
          `
          insert into prekes (cekiai_id, preke, kiekis, kaina, tipai_id)
          values (?, ?, ?, ?, ?)`,
          [cekisId, preke, kiekis, kaina, tipas],
        );
        await commit(conn);
      } catch (err) {
        await rollback(conn);
        // ivyko klaida irasant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else {
    // klaida, ne nepadave duomenu
    // galima butu nusiusti klaidos puslpi
  }
  if (isFinite(cekisId)) {
    res.redirect("/cekis/" + cekisId);
  } else {
    res.redirect("/cekiai");
  }
});

app.get("/preke/:id/del", async (req, res) => {
  const id = parseInt(req.params.id);
  let cekisId;
  if (!isNaN(id)) {
    let conn;
    try {
      conn = await connect();
      await start(conn);
      const { results: prekes } = await query(
        conn,
        `
        select
          cekiai_id as cekisId
        from prekes
        where id = ?`,
        [id],
      );
      if (prekes.length > 0) {
        cekisId = prekes[0].cekisId;
        await query(
          conn,
          `
            delete from prekes
            where id = ?`,
          [id],
        );
      }
      await commit(conn);
    } catch (err) {
      await rollback(conn);
      // ivyko klaida gaunant duomenis
      res.render("klaida", { err });
      return;
    } finally {
      await end(conn);
    }
  }
  if (cekisId) {
    res.redirect("/cekis/" + cekisId);
  } else {
    res.redirect("/cekiai");
  }
});

app.get("/tipai", async (req, res) => {
  let conn;
  try {
    conn = await connect();
    const { results: tipai } = await query(
      conn,
      `
    select
      id, pavadinimas
    from tipai
    order by
      pavadinimas`,
    );
    res.render("tipai", { tipai });
  } catch (err) {
    res.render("klaida", { err });
  } finally {
    await end(conn);
  }
});

app.get("/tipas/:id?", async (req, res) => {
  // tikrinam ar yra perduotas id parametras
  if (req.params.id) {
    const id = parseInt(req.params.id);
    if (!isNaN(id)) {
      let conn;
      try {
        conn = await connect();
        const { results: tipai } = await query(
          conn,
          `
          select
            id, pavadinimas
          from tipai
          where id = ?`,
          [id],
        );
        if (tipai.length > 0) {
          // siame sarase yra VIENAS irasas (tas kurio mes ir ieskojom)
          // generuojam forma su tuo irasu
          res.render("tipas", { tipas: tipai[0] });
        } else {
          // tipas su nurodytu id nerastas
          res.redirect("/tipai");
        }
      } catch (err) {
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
      } finally {
        await end(conn);
      }
    } else {
      // padave id ne skaiciu - dabar siunciam i tipu sarasa
      // o galim parodyt klaidos forma
      res.redirect("/tipai");
    }
  } else {
    // Naujo tipo ivedimas
    res.render("tipas");
  }
});

app.post("/tipas", async (req, res) => {
  if (req.body.id) {
    // update esama tipa
    const id = parseInt(req.body.id);
    if (
      !isNaN(id) &&
      typeof req.body.pavadinimas === "string" &&
      req.body.pavadinimas.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await start(conn);
        await query(
          conn,
          `
          update tipai
          set pavadinimas = ?
          where id = ?`,
          [req.body.pavadinimas, id],
        );
        await commit(conn);
      } catch (err) {
        await rollback(conn);
        // ivyko klaida gaunant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  } else {
    // insert nauja tipa
    if (
      typeof req.body.pavadinimas === "string" &&
      req.body.pavadinimas.trim() !== ""
    ) {
      let conn;
      try {
        conn = await connect();
        await start(conn);
        await query(
          conn,
          `
          insert into tipai (pavadinimas)
          values (?)`,
          [req.body.pavadinimas],
        );
        await commit(conn);
      } catch (err) {
        await rollback(conn);
        // ivyko klaida irasant duomenis
        res.render("klaida", { err });
        return;
      } finally {
        await end(conn);
      }
    }
  }
  res.redirect("/tipai");
});

app.get("/tipas/:id/del", async (req, res) => {
  const id = parseInt(req.params.id);
  if (!isNaN(id)) {
    let conn;
    try {
      conn = await connect();
      await start(conn);
      await query(
        conn,
        `
          delete from tipai
          where id = ?`,
        [id],
      );
      await commit(conn);
    } catch (err) {
      await rollback(conn);
      // ivyko klaida gaunant duomenis
      res.render("klaida", { err });
      return;
    } finally {
      await end(conn);
    }
  }
  res.redirect("/tipai");
});

app.use("/report/visos", async (req, res) => {
  let nuo = new Date(req.body.nuo);
  if (isNaN(nuo.getTime())) {
    nuo = new Date("0001-01-01");
  }
  let iki = new Date(req.body.iki);
  if (isNaN(iki.getTime())) {
    iki = new Date("9999-12-31");
  }
  let conn;
  try {
    conn = await connect();
    const { results: ataskaita } = await query(
      conn,
      `
      select sum(kiekis * kaina) as suma
      from prekes join cekiai on prekes.cekiai_id = cekiai.id
      where cekiai.data >= ? and cekiai.data <= ?`,
      [nuo, iki],
    );
    res.render("report/visos", { suma: ataskaita[0].suma, nuo, iki });
  } catch (err) {
    res.render("klaida", { err });
  } finally {
    await end(conn);
  }
});

app.use("/report/tipai", async (req, res) => {
  let nuo = new Date(req.body.nuo);
  if (isNaN(nuo.getTime())) {
    nuo = new Date("0001-01-01");
  }
  let iki = new Date(req.body.iki);
  if (isNaN(iki.getTime())) {
    iki = new Date("9999-12-31");
  }
  let conn;
  try {
    conn = await connect();
    const { results: ataskaita } = await query(
      conn,
      `
select *
from 
	(select t.id, t.pavadinimas, sum(kiekis * kaina) as suma, count(*) as kiek
		from
			prekes join cekiai on prekes.cekiai_id = cekiai.id
			join tipai t on prekes.tipai_id = t.id
		where cekiai.data >= '2020-11-02' and cekiai.data <= '2020-12-31'
		group by t.id, t.pavadinimas) prekes_su_tipais
	right join tipai t_visi on t_visi.id = prekes_su_tipais.id
order by t_visi.pavadinimas
`,
      [nuo, iki],
    );
    res.render("report/tipai", { ataskaita, nuo, iki });
  } catch (err) {
    res.render("klaida", { err });
  } finally {
    await end(conn);
  }
});

app.post("/json/cekis", async (req, res) => {
  let conn;
  try {
    conn = await connect();
    await start(conn);
    let { results } = await query(
      conn,
      "insert into cekiai (data, parduotuve) values (?, ?);",
      [new Date(), req.body.parduotuve],
    );
    for (const preke of req.body.prekes) {
      await query(
        conn,
        "insert into prekes (cekiai_id, preke, kiekis, kaina, tipai_id) values (?, ?, ?, ?, ?);",
        [
          results.insertId,
          preke.preke,
          preke.kiekis,
          preke.kaina,
          preke.tipaiId,
        ],
      );
    }
    await commit(conn);
    res.set("Content-Type", "application/json");
    res.send(JSON.stringify({
      id: results.insertId,
    }));
  } catch (err) {
    console.log("Klaida", err);
    await rollback(conn);
    res.set("Content-Type", "application/json");
    res.send(JSON.stringify({
      id: null,
      err,
    }));
  } finally {
    await end(conn);
  }
});

app.listen(PORT, () => {
  console.log(`Apskaita app listening at http://localhost:${PORT}`);
});