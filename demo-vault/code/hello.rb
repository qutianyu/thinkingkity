# frozen_string_literal: true

# A simple TaskManager in Ruby demonstrating classes, blocks, and enumerable patterns

class Task
  attr_accessor :title, :priority, :completed

  def initialize(title, priority = :medium)
    @title = title
    @priority = priority
    @completed = false
  end

  def complete!
    @completed = true
  end

  def to_s
    status = @completed ? "[x]" : "[ ]"
    "#{status} [#{@priority.upcase}] #{@title}"
  end
end

class TaskManager
  include Enumerable

  def initialize
    @tasks = []
  end

  def add(title, priority = :medium)
    @tasks << Task.new(title, priority)
  end

  def each(&block)
    @tasks.each(&block)
  end

  def pending
    @tasks.reject(&:completed)
  end

  def by_priority
    order = { high: 0, medium: 1, low: 2 }
    pending.sort_by { |t| order[t.priority] || 99 }
  end

  def summary
    groups = pending.group_by(&:priority).transform_values(&:count)
    puts "Pending tasks by priority:"
    groups.each { |pri, count| puts "  #{pri.upcase}: #{count}" }
  end
end

if __FILE__ == $PROGRAM_NAME
  tm = TaskManager.new
  tm.add("Write unit tests", :high)
  tm.add("Update README", :medium)
  tm.add("Fix typos in docs", :low)
  tm.add("Refactor auth module", :high)
  tm.find { |t| t.title == "Update README" }&.complete!

  tm.summary

  puts "\nSorted pending:"
  tm.by_priority.each { |t| puts "  #{t}" }
end
