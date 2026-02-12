#!/usr/bin/env node

/**
 * Script para gerar commitment compatível com o circuito Noir
 * 
 * Uso:
 *   node generate-commitment.js <hand_value> <salt>
 * 
 * Exemplo:
 *   node generate-commitment.js 3 12345
 */

import { poseidon } from 'poseidon-lite';

// Parse command line arguments
const args = process.argv.slice(2);

if (args.length < 2) {
  console.error('❌ Uso: node generate-commitment.js <hand_value> <salt>');
  console.error('   Exemplo: node generate-commitment.js 3 12345');
  process.exit(1);
}

const handValue = parseInt(args[0]);
const salt = BigInt(args[1]);

// Validação
if (isNaN(handValue) || handValue < 0 || handValue > 5) {
  console.error('❌ hand_value deve ser um número entre 0 e 5');
  process.exit(1);
}

try {
  // Gerar commitment usando Poseidon BN254 (compatível com Noir)
  const commitment = poseidon([BigInt(handValue), salt]);
  
  console.log('\n✅ Commitment gerado com sucesso!');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log(`📊 Hand Value: ${handValue}`);
  console.log(`🔑 Salt: ${salt.toString()}`);
  console.log(`🔒 Commitment: 0x${commitment.toString(16).padStart(64, '0')}`);
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('\n📝 Adicione estes valores ao Prover.toml:');
  console.log(`\nhand_value = "${handValue}"`);
  console.log(`salt = "0x${salt.toString(16).padStart(64, '0')}"`);
  console.log(`commitment = "0x${commitment.toString(16).padStart(64, '0')}"`);
  console.log(`max_allowed = "5"`);
  console.log('');
} catch (error) {
  console.error('❌ Erro ao gerar commitment:', error.message);
  process.exit(1);
}
