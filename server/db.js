import * as mysql from "mysql";

const OPTIONS = {
  host: "192.168.2.65",
  user: "sql_usr_zmonesDB",
  password: "PKUquUbdavMEu3XR",
  database: "zmones",
  multipleStatements: true,
};

const pool = mysql.createPool(OPTIONS);

function connect() {
  return new Promise((resolve, reject) => {
    pool.getConnection((err, conn) => {
      if (err) {
        return reject(err);
      }
      resolve(conn);
    });
  });
}

function query(conn, sql, values) {
  return new Promise((resolve, reject) => {
    conn.query({
      sql,
      values,
    }, (err, results, fields) => {
      if (err) {
        return reject(err);
      }
      resolve({ results, fields });
    });
  });
}

function end(conn) {
  return new Promise((resolve, reject) => {
    if (conn) {
      conn.release();
    }
    resolve();
  });
}

export { connect, end, query };
