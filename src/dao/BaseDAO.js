const { query } = require('../config/db');

/**
 * BaseDAO
 * Encapsula el acceso a datos común a todas las entidades (SRP: esta clase
 * solo sabe hablar con la base de datos, nunca contiene reglas de negocio).
 * Las DAO concretas extienden esta clase (OCP/LSP: se puede sustituir o
 * extender sin modificar el comportamiento base).
 */
class BaseDAO {
  constructor(tableName, pkColumn) {
    if (!tableName || !pkColumn) {
      throw new Error('BaseDAO requiere tableName y pkColumn');
    }
    this.tableName = tableName;
    this.pkColumn = pkColumn;
  }

  async findById(id) {
    const { rows } = await query(
      `SELECT * FROM ${this.tableName} WHERE ${this.pkColumn} = $1`,
      [id]
    );
    return rows[0] || null;
  }

  async existsById(id) {
    const { rows } = await query(
      `SELECT 1 FROM ${this.tableName} WHERE ${this.pkColumn} = $1`,
      [id]
    );
    return rows.length > 0;
  }

  async deleteById(id) {
    await query(`DELETE FROM ${this.tableName} WHERE ${this.pkColumn} = $1`, [id]);
    return true;
  }
}

module.exports = BaseDAO;
