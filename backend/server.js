// ====================================
// CARGAR VARIABLES DE ENTORNO
// ====================================
require('dotenv').config();

const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ====================================
// CONFIGURACIÓN DE POSTGRESQL (SEGURA)
// ====================================
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

console.log('🔧 Configuración de PostgreSQL:');
console.log(`   Host: ${process.env.DB_HOST}:${process.env.DB_PORT}`);
console.log(`   Database: ${process.env.DB_NAME}`);
console.log(`   User: ${process.env.DB_USER}`);
console.log('   🔒 Contraseña: [PROTEGIDA]\n');

// Verificar conexión
pool.connect((err, client, release) => {
  if (err) {
    console.error('❌ Error al conectar a PostgreSQL:', err.message);
    console.error('\n🔍 VERIFICA:');
    console.error('   1. PostgreSQL está corriendo');
    console.error('   2. Las variables de entorno en .env son correctas');
    console.error('   3. El puerto está disponible\n');
    process.exit(1);
  }
  release();
  console.log('✅ Conectado a PostgreSQL exitosamente\n');
  createTables();
});

// ====================================
// CREAR TABLAS
// ====================================
async function createTables() {
  const client = await pool.connect();
  try {
    console.log('📋 Creando tablas...\n');

    // Tabla Productos
    await client.query(`
      CREATE TABLE IF NOT EXISTS productos (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        quantity INTEGER NOT NULL DEFAULT 0,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2) NOT NULL,
        min_stock INTEGER DEFAULT 5,
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla productos lista');

    // Tabla Ventas
    await client.query(`
      CREATE TABLE IF NOT EXISTS ventas (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES productos(id),
        product_name VARCHAR(255) NOT NULL,
        category VARCHAR(100) NOT NULL,
        quantity INTEGER NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        cost DECIMAL(10,2) NOT NULL,
        total DECIMAL(10,2) NOT NULL,
        profit DECIMAL(10,2) NOT NULL,
        customer VARCHAR(255),
        payment VARCHAR(50),
        notes TEXT,
        sale_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla ventas lista');

    // Tabla Movimientos de Stock
    await client.query(`
      CREATE TABLE IF NOT EXISTS movimientos_stock (
        id SERIAL PRIMARY KEY,
        product_id INTEGER NOT NULL REFERENCES productos(id),
        quantity INTEGER NOT NULL,
        type VARCHAR(20) NOT NULL,
        supplier VARCHAR(255),
        cost DECIMAL(10,2),
        notes TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    console.log('✅ Tabla movimientos_stock lista\n');

  } catch (err) {
    console.error('❌ Error al crear tablas:', err.message);
  } finally {
    client.release();
  }
}

// ====================================
// RUTAS API - PRODUCTOS
// ====================================

app.get('/api/products', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener productos' });
  }
});

app.get('/api/products/:id', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM productos WHERE id = $1', [req.params.id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener producto' });
  }
});

app.post('/api/products', async (req, res) => {
  try {
    const { name, category, quantity, price, cost, minStock, notes } = req.body;
    
    const result = await pool.query(
      `INSERT INTO productos (name, category, quantity, price, cost, min_stock, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [name, category, quantity, price, cost, minStock || 5, notes || '']
    );
    
    console.log('✅ Producto creado:', name);
    res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al crear producto' });
  }
});

app.put('/api/products/:id', async (req, res) => {
  try {
    const { name, category, quantity, price, cost, minStock, notes } = req.body;
    
    const result = await pool.query(
      `UPDATE productos 
       SET name = $1, category = $2, quantity = $3, price = $4, 
           cost = $5, min_stock = $6, notes = $7, updated_at = CURRENT_TIMESTAMP
       WHERE id = $8
       RETURNING *`,
      [name, category, quantity, price, cost, minStock, notes || '', req.params.id]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    console.log('✅ Producto actualizado:', name);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al actualizar producto' });
  }
});

app.delete('/api/products/:id', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    // 1. Verificar si el producto existe
    const productCheck = await client.query(
      'SELECT * FROM productos WHERE id = $1', 
      [req.params.id]
    );
    
    if (productCheck.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const product = productCheck.rows[0];
    
    // 2. Verificar si tiene ventas asociadas
    const salesCheck = await client.query(
      'SELECT COUNT(*) as count FROM ventas WHERE product_id = $1',
      [req.params.id]
    );
    
    if (parseInt(salesCheck.rows[0].count) > 0) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: `No se puede eliminar "${product.name}" porque tiene ${salesCheck.rows[0].count} ventas registradas. Considera desactivarlo en lugar de eliminarlo.`
      });
    }
    
    // 3. Verificar movimientos de stock
    const stockCheck = await client.query(
      'SELECT COUNT(*) as count FROM movimientos_stock WHERE product_id = $1',
      [req.params.id]
    );
    
    // 4. Eliminar movimientos de stock si existen
    if (parseInt(stockCheck.rows[0].count) > 0) {
      await client.query(
        'DELETE FROM movimientos_stock WHERE product_id = $1',
        [req.params.id]
      );
      console.log(`🗑️ ${stockCheck.rows[0].count} movimientos de stock eliminados`);
    }
    
    // 5. Finalmente eliminar el producto
    await client.query('DELETE FROM productos WHERE id = $1', [req.params.id]);
    
    await client.query('COMMIT');
    console.log('🗑️ Producto eliminado:', product.name);
    res.json({ 
      success: true,
      message: 'Producto eliminado exitosamente',
      product: product.name
    });
    
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Error al eliminar producto:', err.message);
    res.status(500).json({ 
      error: 'Error al eliminar producto',
      details: err.message 
    });
  } finally {
    client.release();
  }
});

// ====================================
// RUTAS API - VENTAS
// ====================================

app.get('/api/sales', async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM ventas ORDER BY sale_date DESC');
    res.json(result.rows);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener ventas' });
  }
});

app.post('/api/sales', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { productId, quantity, customer, payment, notes } = req.body;
    
    const productResult = await client.query('SELECT * FROM productos WHERE id = $1', [productId]);
    
    if (productResult.rows.length === 0) {
      await client.query('ROLLBACK');
      return res.status(404).json({ error: 'Producto no encontrado' });
    }
    
    const product = productResult.rows[0];
    
    if (product.quantity < quantity) {
      await client.query('ROLLBACK');
      return res.status(400).json({ 
        error: 'Stock insuficiente',
        available: product.quantity,
        requested: quantity
      });
    }
    
    const total = product.price * quantity;
    const profit = (product.price - product.cost) * quantity;
    
    const saleResult = await client.query(
      `INSERT INTO ventas (product_id, product_name, category, quantity, price, cost, total, profit, customer, payment, notes)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
       RETURNING *`,
      [productId, product.name, product.category, quantity, product.price, product.cost, 
       total, profit, customer || 'Cliente General', payment || 'Efectivo', notes || '']
    );
    
    await client.query(
      'UPDATE productos SET quantity = quantity - $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, productId]
    );
    
    await client.query('COMMIT');
    console.log('💰 Venta registrada:', product.name, 'x', quantity);
    res.status(201).json(saleResult.rows[0]);
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al registrar venta' });
  } finally {
    client.release();
  }
});

// ====================================
// RUTAS API - STOCK
// ====================================

app.post('/api/stock/add', async (req, res) => {
  const client = await pool.connect();
  
  try {
    await client.query('BEGIN');
    
    const { productId, quantity, supplier, cost, notes } = req.body;
    
    await client.query(
      'UPDATE productos SET quantity = quantity + $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
      [quantity, productId]
    );
    
    await client.query(
      `INSERT INTO movimientos_stock (product_id, quantity, type, supplier, cost, notes)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [productId, quantity, 'ENTRADA', supplier || '', cost || 0, notes || '']
    );
    
    await client.query('COMMIT');
    console.log('📦 Stock agregado a producto', productId);
    res.json({ message: 'Stock agregado exitosamente' });
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al agregar stock' });
  } finally {
    client.release();
  }
});

// ====================================
// RUTAS API - ESTADÍSTICAS
// ====================================

app.get('/api/stats', async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT 
        (SELECT COUNT(*) FROM productos) as totalproducts,
        (SELECT COALESCE(SUM(quantity * price), 0) FROM productos) as totalvalue,
        (SELECT COUNT(*) FROM productos WHERE quantity > 0 AND quantity <= min_stock) as lowstock,
        (SELECT COUNT(*) FROM ventas) as totalsales,
        (SELECT COALESCE(SUM(total), 0) FROM ventas) as totalrevenue,
        (SELECT COALESCE(SUM(profit), 0) FROM ventas) as totalprofit,
        (SELECT COUNT(*) FROM ventas WHERE DATE(sale_date) = CURRENT_DATE) as todaysales
    `);
    res.json(result.rows[0]);
  } catch (err) {
    console.error('Error:', err);
    res.status(500).json({ error: 'Error al obtener estadísticas' });
  }
});

// ====================================
// RUTA RAÍZ
// ====================================

app.get('/', (req, res) => {
  res.json({ 
    message: '🎉 API ONE TOUCH - Sistema IX-RP',
    status: 'Online',
    version: '1.0.0',
    database: 'PostgreSQL',
    environment: process.env.NODE_ENV,
    endpoints: {
      products: '/api/products',
      sales: '/api/sales',
      stock: '/api/stock/add',
      stats: '/api/stats'
    }
  });
});

// ====================================
// INICIAR SERVIDOR
// ====================================

app.listen(PORT, () => {
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🚀 Servidor corriendo en http://localhost:' + PORT);
  console.log('📊 API disponible en http://localhost:' + PORT + '/api');
  console.log('🐘 Base de datos: PostgreSQL');
  console.log(`🌍 Entorno: ${process.env.NODE_ENV}`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

// Cerrar conexión al salir
process.on('SIGINT', async () => {
  await pool.end();
  console.log('\n✅ Conexión a PostgreSQL cerrada');
  process.exit(0);
});
