# Enterprise Solutions Hub — Context Map

The Enterprise Solutions Hub is a unified portal where users browse enterprise systems, read their descriptions, and open them through a link or an “Open System” button.

The platform is divided into three bounded contexts. Each context has a clear responsibility, owns specific information, and shares that information with other contexts.

## Context 1: Solution Catalog

**Owner:** Catalog Coordinator  
**Purpose:** Help users discover existing enterprise solutions, services, APIs, and reusable development resources, understand what they provide, and open registered systems from the hub.

| Word | What it means inside Solution Catalog |
|---|---|
| Solution | A registered software system with a unique ID, name, description, and business purpose. |
| System Link | The destination URL used to open a registered system from its page in the hub. |
| API | An interface offered by a solution, listed with a description of what it provides. |
| Owner | The team responsible for a solution and its catalog information. |

**What Solution Catalog promises to others:**

- Every registered solution has a unique, stable ID.
- It maintains the official name, description, and responsible team for each solution.
- It lets users review a system’s description before opening it.
- It maintains system links and provides an “Open System” action that takes users to the selected system.
- It shares solution IDs and basic information with the other contexts.

## Context 2: Documentation

**Owner:** Documentation Coordinator  
**Purpose:** Help users find technical and functional information about registered solutions.

| Word | What it means inside Documentation |
|---|---|
| Document | A user guide, technical specification, or API reference linked to a solution. |
| Version | A revision of a document, which may differ from the software version. |
| Source | The location where the original document is maintained. |

**What Documentation promises to others:**

- Every document is linked to a solution using its catalog ID.
- It maintains document titles, sources, and available version information.
- It provides documentation references for display on solution pages.

## Context 3: Architecture & Dependencies

**Owner:** Architecture Coordinator  
**Purpose:** Help users understand how enterprise systems connect and depend on each other.

| Word | What it means inside Architecture & Dependencies |
|---|---|
| System | A registered solution viewed in terms of its relationships with other systems. |
| Dependency | A relationship in which one system needs another system or API to perform a function. |
| Capability | A business function supported by a system, such as employee management or approvals. |

**What Architecture & Dependencies promises to others:**

- It identifies systems using their catalog IDs.
- It records the direction and purpose of each dependency.
- It provides system relationships and capability mappings for display in the hub.

## Relationships Between Contexts

| Information provider | Information receiver | Information shared |
|---|---|---|
| Solution Catalog | Documentation | Solution IDs and names used to link documents to solutions |
| Solution Catalog | Architecture & Dependencies | Solution IDs and names used to identify systems |
| Documentation | Solution Catalog | Documentation references shown on solution pages |
| Architecture & Dependencies | Solution Catalog | Dependencies and capabilities shown on solution pages |

Each context manages its own information. Other contexts use that information without independently changing its meaning.

## Example

An employee searches for an existing approval solution.

1. **Solution Catalog** provides its name, purpose, and responsible team.
2. **Documentation** provides links to its user guide and API documentation.
3. **Architecture & Dependencies** shows that it depends on the employee directory and identity system.
4. After reviewing the information, the employee selects **Open System** on the catalog page and is taken to the approval system.

The hub presents this information through a unified interface, helping the employee understand the solution, evaluate whether it can be reused, and open it.

## Initial Scope

This map covers system discovery, descriptions, links for opening systems, documentation, and system relationships. Opening a system through a link belongs to Solution Catalog and does not require a separate context.

Governance workflows and development-tool integrations are planned as future extensions. Single sign-on and access-permission management have not yet been defined.
