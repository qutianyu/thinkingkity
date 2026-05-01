import java.util.List;
import java.util.Optional;
import java.util.stream.Collectors;

/**
 * A sample Java class demonstrating OOP patterns and modern Java features.
 */
public class TaskManager {

    public enum Priority { LOW, MEDIUM, HIGH }

    public record Task(String title, Priority priority, boolean done) {
        public Task markDone() {
            return new Task(title, priority, true);
        }
        public String summary() {
            return String.format("[%s] %s (%s)", done ? "x" : " ", title, priority);
        }
    }

    private final List<Task> tasks;

    public TaskManager(List<Task> tasks) {
        this.tasks = tasks;
    }

    public List<Task> filterByPriority(Priority priority) {
        return tasks.stream()
            .filter(t -> t.priority() == priority)
            .collect(Collectors.toList());
    }

    public List<Task> pendingTasks() {
        return tasks.stream()
            .filter(t -> !t.done())
            .collect(Collectors.toList());
    }

    public Optional<Task> findTask(String title) {
        return tasks.stream()
            .filter(t -> t.title().equalsIgnoreCase(title))
            .findFirst();
    }

    public static void main(String[] args) {
        var manager = new TaskManager(List.of(
            new Task("Write tests", Priority.HIGH, false),
            new Task("Fix login bug", Priority.HIGH, true),
            new Task("Update docs", Priority.LOW, false)
        ));

        System.out.println("Pending:");
        manager.pendingTasks().forEach(t -> System.out.println("  " + t.summary()));

        var found = manager.findTask("Write tests");
        found.ifPresent(t -> System.out.println("Found: " + t.summary()));
    }
}
