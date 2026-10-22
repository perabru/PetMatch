import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

// Exercise the existing backup privacy boundary directly, without invoking
// any Firebase operation or DOM handler.
const script = await readFile(new URL('../script.js', import.meta.url), 'utf8');
const declarations = script.slice(script.indexOf('  const seeds ='), script.indexOf('  const notice ='));
const restore = script.slice(script.indexOf('  function restoreSafeState('), script.indexOf('  const outgoingToCancel ='));
const stamp = '2026-10-22T12:00:00.000Z';
const pet = id => ({ id, name: 'Pipoca', type: 'gato', age: 2, ageUnit: 'anos', size: 'pequeno', breed: 'SRD', city: 'Jacareí', purpose: 'amizade', description: 'Perfil do pet', photo: '', createdAt: stamp, updatedAt: stamp });
const state = () => ({ schemaVersion: 1, revision: 2, pets: [], favorites: [], interests: [], reports: [], vetRequests: [] });
function context() {
  const box = vm.createContext({ crypto: { randomUUID: () => 'remapped-pet-id' } });
  vm.runInContext(declarations + restore + '\nglobalThis.restore = restoreSafeState;', box);
  return box;
}

test('imported interests remain private notes and never retain a delivery recipient', () => {
  const box = context(), backup = state();
  backup.interests.push({ id: 'interest-1', createdAt: stamp, kind: 'amizade', petId: 'other-pet', petName: 'Luna', name: 'Tutor', message: 'Mensagem privada', status: 'salvo', recipientId: 'other-owner' });
  const result = box.restore(backup);
  assert.equal(result.interests[0].recipientId, undefined);
  assert.equal(result.interests[0].message, 'Mensagem privada');
  assert.equal(result.interests[0].status, 'salvo');
  assert.equal(backup.interests[0].recipientId, 'other-owner', 'Reading a backup must not mutate its original object.');
});

test('import remaps another owner pet ID together with favorites and notes', () => {
  const box = context(), backup = state();
  box.catalog = [{ ...pet('existing-pet'), ownerId: 'other-owner' }];
  vm.runInContext('publicPets = catalog; activeUser = { uid: "current-owner" };', box);
  backup.pets.push(pet('existing-pet')); backup.favorites.push('existing-pet');
  backup.interests.push({ id: 'note-1', createdAt: stamp, kind: 'amizade', petId: 'existing-pet', petName: 'Pipoca', name: 'Tutor', message: 'Anotação', status: 'salvo' });
  const result = box.restore(backup);
  assert.equal(result.pets[0].id, 'remapped-pet-id');
  assert.equal(result.favorites[0], 'remapped-pet-id');
  assert.equal(result.interests[0].petId, 'remapped-pet-id');
  assert.equal(backup.pets[0].id, 'existing-pet');
});

test('import refuses executable photo URLs and duplicate profile IDs', () => {
  const box = context(), backup = state();
  backup.pets.push({ ...pet('unsafe'), photo: 'javascript:alert(1)' });
  assert.throws(() => box.restore(backup), /Imagem inválida/);
  backup.pets = [pet('same-id'), pet('same-id')];
  assert.throws(() => box.restore(backup), /identificadores de pets repetidos/);
});
