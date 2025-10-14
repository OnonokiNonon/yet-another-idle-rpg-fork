"use strict";

import { add_quest_to_display, log_message, update_displayed_quest, update_displayed_quest_task } from "./display.js";
import { process_rewards } from "./main.js";

const quests = {};
const active_quests = {};

class QuestTask {
    constructor({
        task_description = "", //optional
        task_condition = {}, 
        //conditions for task to be completed; can be skipped if it's meant to be achieved via some rewards object  
        task_rewards = {}, //generally skipped in favour of quest reward but could sometimes have something?
        is_hidden = false, //keep it false most of the time, but could be used as a fake way of making quests with no visible requirement for progress
        is_finished = false,
    })
    {
        this.task_description = task_description;
        this.task_condition = task_condition;
        this.task_rewards = task_rewards;
        this.is_hidden = is_hidden;
        this.is_finished = is_finished;

        Object.keys(this.task_condition).forEach(task_group => {
            Object.keys(this.task_condition[task_group]).forEach(task_type => {
                    Object.keys(this.task_condition[task_group][task_type]).forEach(task_target_id => {
                        this.task_condition[task_group][task_type][task_target_id].current = 0;
                    });
            });
        });
    }
}

class Quest {
    constructor({
                quest_name, //for display, can be skipped if getQuestName covers all possibilites
                quest_id, //can be skipped, will be set by a short script at the end of the file
                quest_description, // -||-
                questline, //questline for grouping or something, skippable
                quest_tasks = [], //an array of tasks that need to be completed one by one
                quest_condition, //conditions for task to be completed; can be skipped if it's meant to be achieved via some rewards object; works the same as in QuestTask
                quest_rewards, //may include a new quest to automatically start
                is_hidden = false, //hidden quests are not visible and are meant to function as additional unlock mechanism; name and description are skipped
                is_finished = false,
                is_repeatable = false, //true => doesn't get locked after completion and can be gained again
                getQuestName = ()=>{return this.quest_name;},
                getQuestDescription = ()=>{return this.quest_description;},
    }) {
        this.quest_name = quest_name;
        this.quest_id = quest_id;
        this.questline = questline;
        this.quest_tasks = quest_tasks;
        this.quest_description = quest_description;
        this.quest_rewards = quest_rewards || {};
        this.is_hidden = is_hidden;
        this.is_finished = is_finished;
        this.is_repeatable = is_repeatable;
        this.quest_condition = quest_condition;
        this.getQuestName = getQuestName;
        this.getQuestDescription = getQuestDescription;
    }

    getCompletedTaskCount(){
        if(this.quest_tasks.length == 0) {
            return 0;
        } else {
            return this.quest_tasks.filter(task => task.is_finished).length;
        }
    }
}

const questManager = {
    startQuest({quest_id, should_inform = true}) {
        const quest = quests[quest_id];
        if((!quest.is_finished || quest.is_repeatable) && !this.isQuestActive(quest_id)) {
            active_quests[quest_id] = new Quest(quests[quest_id]);
        }

        if(!quest.is_hidden) {
            add_quest_to_display(quest_id);
            if(should_inform) {
                log_message(`Started a new quest: ${quests[quest_id].getQuestName()}`);
            }
        }
    },

    isQuestActive(quest_id) {
        return active_quests[quest_id];
    },

    finishQuest({quest_id, only_unlocks = false, skip_rewards = false}) {
        if(this.isQuestActive(quest_id)) {
            let quest = quests[quest_id];
            if(!quest.is_repeatable) {
                quest.is_finished = true;
            }
            delete active_quests[quest_id];
            if(!quests[quest_id].is_hidden) {
                update_displayed_quest(quest_id);
            }

            if(!skip_rewards) {
                process_rewards({rewards: quests[quest_id].quest_rewards, source_type: "Quest", source_name: quests[quest_id].getQuestName(), only_unlocks: only_unlocks});
            }
        }
    },

    finishQuestTask({quest_id, task_index, only_unlocks, skip_warning = false}) {
        if(this.isQuestActive(quest_id)) {
            let quest = quests[quest_id];
            quest.quest_tasks[task_index].is_finished = true;
            if(!quests[quest_id].is_hidden) {
                update_displayed_quest_task(quest_id, task_index);
                update_displayed_quest(quest_id);
            }

            process_rewards({rewards: quest.quest_tasks[task_index].task_rewards, source_type: "Quest", source_name: quests[quest_id].getQuestName(), only_unlocks: only_unlocks});

        } else {
            if(!skip_warning) {
                console.warn(`Cannot finish task at index ${task_index} for quest "${quest_id}", as it's not a currently active quest!`);
            }
        }
    },

    catchQuestEvent({quest_event_type, quest_event_target, quest_event_count, additional_quest_tags = {}}) {
        Object.keys(active_quests).forEach(active_quest_id => {
            if(!(active_quest_id in active_quests)) {
                //can happen if one quest deletes another
                return;
            }
            const current_task_index = active_quests[active_quest_id].quest_tasks.findIndex(task => !task.is_finished); //just get the first unfinished
            const current_task = active_quests[active_quest_id].quest_tasks[current_task_index];

            let is_any_met = "any" in current_task.task_condition?false:true;
            let is_all_met = "all" in current_task.task_condition?true:false;

            Object.keys(current_task.task_condition).forEach(task_group => {
            /*
                task_group (any/all): {
                    task_type (kill/kill_any/clear/reach_skill/enter_location/something_else?): { <- quest_event_type
                        task_target_id (some related id): { <- quest_event_target
                            target: Number,   //for enter_location, best put it at 1; for reach_skill, value is set to quest_event_count instead of being incremented by it
                            current: Number,
                            requirements: {}, //additional tags needed, like "weapon: unarmed" making it required to use unarmed
                            restrictions: {} //opposite of requirements, like "weapon: unarmed" making it required to NOT use unarmed
                        }
                    }
                }

                //

                any: {
                    kill: { //by id
                            "Wolf rat": { target: 10, current: 0, requirements: [],}, 
                            "Wolf": {target: 5, current: 0, requirements: [],}
                    },
                    kill_any: {"Pest": {requirements: [], target: , current: ,}}}, //by tags
                    clear: {"Infested field": {}} //by id
                }
                all:{
                    //same
                }
            */

                
                Object.keys(current_task.task_condition[task_group]).forEach(task_type => {
                    Object.keys(current_task.task_condition[task_group][task_type]).forEach(task_target_id => {
                        if(!current_task.task_condition[task_group][task_type][task_target_id].current) {
                            current_task.task_condition[task_group][task_type][task_target_id].current = 0;
                        }
                    });

                    //if event is of proper type, check further conditions, increase the count and check if it's completed
                    if(quest_event_type in current_task.task_condition[task_group] && quest_event_target in current_task.task_condition[task_group][quest_event_type]) {

                        let requirements_met = true;

                        //check if additional requirements are not met (present in additional tags)
                        const requirements = current_task.task_condition[task_group][quest_event_type][quest_event_target].requirements;
                        Object.keys(requirements || {}).forEach(requirement => {
                            if(!additional_quest_tags[requirement] || additional_quest_tags[requirement] != requirements[requirement]) {
                                requirements_met = false;
                            }
                        });

                        if(requirements_met) {
                            const restrictions = current_task.task_condition[task_group][quest_event_type][quest_event_target].restrictions;
                            Object.keys(restrictions || {}).forEach(restriction => {
                                if(additional_quest_tags[restriction] && additional_quest_tags[restriction] === restrictions[restriction]) {
                                    requirements_met = false;
                                }
                            });
                        }

                        //if they are not met, return without changing .current
                        if(!requirements_met) {
                            return;
                        }

                        if(quest_event_type === "reach_skill") {
                            current_task.task_condition[task_group][quest_event_type][quest_event_target].current = quest_event_count;
                        } else {
                            current_task.task_condition[task_group][quest_event_type][quest_event_target].current += quest_event_count;
                        }

                        //any => set to true after first met, as only one is needed
                        //all => set to false after first not met, as all are needed
                        if(task_group === "any" && current_task.task_condition[task_group][quest_event_type][quest_event_target].current >= current_task.task_condition[task_group][quest_event_type][quest_event_target].target) {
                            is_any_met = true;
                        } else if(task_group === "all" && current_task.task_condition[task_group][quest_event_type][quest_event_target].current < current_task.task_condition[task_group][quest_event_type][quest_event_target].target) {
                            is_all_met = false;
                        }
                    }
                });
            });
            if(is_any_met && is_all_met) { //completed
                this.finishQuestTask({quest_id: active_quest_id, task_index: current_task_index});
            } else {
                if(!active_quests[active_quest_id].is_hidden && !active_quests[active_quest_id].quest_tasks[current_task_index.is_hidden]) {
                    update_displayed_quest_task(active_quest_id, current_task_index);
                }
            }

            const remaining_tasks = active_quests[active_quest_id].quest_tasks.filter(task => !task.is_finished);
            if(remaining_tasks.length == 0) { //no more tasks
                this.finishQuest({quest_id: active_quest_id});
            }
        });
    },
};


//Main story quests
(()=>{
    quests["Lost memory"] = new Quest({
        quest_name: "Lost memory",
        getQuestDescription: ()=>{
            const completed_tasks =  quests["Lost memory"].getCompletedTaskCount(); 
            if(completed_tasks == 0) {
                return "You woke up in some village and you have no idea how you got here or who you are. Just what could have happened?";
            } else if(completed_tasks == 1) {
                return "You lost your memories after being attacked by unknown assailants and were rescued by local villagers. You need to find out who, why, and if possible, how to recover them.";
            }
        },
        questline: "Lost memory",
        quest_tasks: [
            new QuestTask({task_description: "Find out what happened"}), //talk to elder
            new QuestTask({is_hidden: true}), //so that the 1st task is completed but the next is not yet displayed
            new QuestTask({task_description: "Help with the wolf rat infestation"}), //talk to elder after dealing with them
            new QuestTask({task_description: "Continue your search"}), //talk to suspicious guy
            new QuestTask({task_description: "Get into the town (tbc)"}), //not yet possible
        ]
    });

    quests["The Infinite Rat Saga"] = new Quest({
        quest_name: "The Infinite Rat Saga",
        getQuestDescription: ()=>{
            return "You found more rats in the caves. You might as well try getting to the bottom of that issue.";
        },
        questline: "The Infinite Rat Saga",
        quest_tasks: [
            new QuestTask({task_description: "Go deeper"}), //beat the 'Mysterious gate'
            new QuestTask({task_description: "Open the mysterious gate"}),
            new QuestTask({task_description: "Get through the corrupted tunnel"}), 
            new QuestTask({task_description: "Go even deeper (tbc)"}), //not yet possible to open 2nd gate
        ]
    });
})();

//Hidden quests for unlocks
(()=>{
    quests["Swimming/climbing unlock"] = new Quest({
        //climbing can still be unlocked via fights in the cave
        is_hidden: true,
        quest_tasks: [
            new QuestTask({
                task_condition: {
                    all: {
                        reach_skill: {
                            "Running": {target: 12},
                            "Weightlifting": {target: 12},
                        }
                    }
                }
            })
        ],
        quest_rewards: {
            textlines: [{dialogue: "village elder", lines: ["more training"], skip_message: true}],
        }
    });
    quests["Swimming alternative unlock"] = new Quest({
        //climbing can still be unlocked via fights in the cave
        is_hidden: true,
        quest_rewards: {
            activities: [{location:"Village", activity:"swimming"}],
            messages: ["With all the training you have done so far, the idea of submerging yourself in the river passing by the village is really tempting"],
        },
        quest_tasks: [
            new QuestTask({
                task_condition: {
                    all: {
                        reach_skill: {
                            "Running": {target: 15},
                            "Weightlifting": {target: 15},
                        }
                    }
                }
            }),
            new QuestTask({
                task_condition: {
                    all: {
                        enter_location: {
                            "Village": {
                                target: 1,
                                restrictions: {season: "Winter"}, //won't trigger in winter
                            },
                        }
                    }
                }
            }) 
        ],
    });
})();

/*
quests["Test quest"] = new Quest({
    quest_name: "Test quest",
    id: "Test quest",
    quest_description: "Raaaaaaaaaaat ratratratratrat rat rat rat",
    quest_tasks: [
        new QuestTask({
            task_description: "task 1 blah blah",
            task_condition: {
                any: {
                    kill: {
                        "Wolf rat": {target: 10}
                    }
                }
            }
        }),
        new QuestTask({
            task_description: "task 2 blah blah",
            is_hidden: true,
        }),
        new QuestTask({
            task_description: "task 3 blah blah",
            task_condition: {
                any: {
                    kill: {
                        "Wolf rat": {target: 20}
                    }
                }
            }
        }),
    ]
});
*/

Object.keys(quests).forEach(quest => {
    quests[quest].id = quest;
});

export { quests, active_quests, questManager};