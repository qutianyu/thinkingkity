#include <iostream>
#include <vector>
#include <string>
#include <algorithm>
#include <map>

enum class Priority { Low, Medium, High };

struct Task {
    std::string title;
    Priority priority;
    bool completed;

    std::string priorityStr() const {
        switch (priority) {
            case Priority::Low:    return "Low";
            case Priority::Medium: return "Medium";
            case Priority::High:   return "High";
        }
        return "Unknown";
    }
};

class TaskManager {
    std::vector<Task> tasks;

public:
    void add(const std::string& title, Priority p) {
        tasks.push_back({title, p, false});
    }

    void complete(size_t index) {
        if (index < tasks.size()) tasks[index].completed = true;
    }

    std::vector<const Task*> pendingByPriority() const {
        std::vector<const Task*> pending;
        for (const auto& t : tasks) {
            if (!t.completed) pending.push_back(&t);
        }
        std::sort(pending.begin(), pending.end(), [](const Task* a, const Task* b) {
            return static_cast<int>(a->priority) > static_cast<int>(b->priority);
        });
        return pending;
    }

    void printSummary() const {
        std::map<Priority, int> counts;
        for (const auto& t : tasks) {
            if (!t.completed) counts[t.priority]++;
        }
        std::cout << "Pending tasks by priority:\n";
        for (auto& [pri, count] : counts) {
            std::cout << "  " << tasks[0].priorityStr() << ": " << count << "\n";
        }
    }
};

int main() {
    TaskManager tm;
    tm.add("Write unit tests", Priority::High);
    tm.add("Update README", Priority::Medium);
    tm.add("Fix typos in docs", Priority::Low);
    tm.add("Refactor auth module", Priority::High);
    tm.complete(1);

    tm.printSummary();

    auto pending = tm.pendingByPriority();
    std::cout << "\nSorted pending:\n";
    for (const auto* t : pending) {
        std::cout << "  [" << t->priorityStr() << "] " << t->title << "\n";
    }

    return 0;
}
