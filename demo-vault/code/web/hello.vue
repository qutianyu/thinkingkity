<script setup lang="ts">
import { ref, computed } from "vue";

interface Task {
  id: number;
  text: string;
  done: boolean;
}

const newTask = ref("");
const tasks = ref<Task[]>([
  { id: 1, text: "Set up Tauri project", done: true },
  { id: 2, text: "Add Milkdown editor", done: true },
  { id: 3, text: "Write component tests", done: false },
]);

const pending = computed(() => tasks.value.filter((t) => !t.done).length);

function addTask() {
  const text = newTask.value.trim();
  if (!text) return;
  tasks.value.push({ id: Date.now(), text, done: false });
  newTask.value = "";
}

function toggle(task: Task) {
  task.done = !task.done;
}
</script>

<template>
  <div class="task-list">
    <h2>Todo ({{ pending }} remaining)</h2>
    <form @submit.prevent="addTask">
      <input v-model="newTask" placeholder="What needs to be done?" />
    </form>
    <ul>
      <li v-for="task in tasks" :key="task.id" :class="{ done: task.done }">
        <input type="checkbox" :checked="task.done" @change="toggle(task)" />
        {{ task.text }}
      </li>
    </ul>
  </div>
</template>

<style scoped>
.task-list {
  max-width: 480px;
  margin: 0 auto;
  font-family: system-ui, sans-serif;
}
.done {
  text-decoration: line-through;
  opacity: 0.5;
}
</style>
