const { query } = require('../config/db');
const BaseDAO = require('./BaseDAO');

class ContactoDAO extends BaseDAO {
  constructor() {
    super('Contacto', 'id_contacto');
  }

  async crear({ nombre, telefono, email, asunto, mensaje }) {
    const { rows } = await query(
      `INSERT INTO Contacto (nombre, telefono, email, asunto, mensaje)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id_contacto`,
      [nombre, telefono, email, asunto, mensaje]
    );
    return rows[0].id_contacto;
  }
}

module.exports = new ContactoDAO();
