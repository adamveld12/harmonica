export const ISSUE_FIELDS = `
  id
  identifier
  title
  description
  url
  createdAt
  updatedAt
  state { id name type }
  labels { nodes { name } }
  assignee { id displayName }
  project { id name }
  team { id key }
`;

export const FETCH_ALL_ISSUES = `
  query FetchAllIssues($after: String, $filter: IssueFilter) {
    issues(first: 50, after: $after, filter: $filter) {
      nodes { ${ISSUE_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const FETCH_SINGLE_ISSUE = `
  query FetchSingleIssue($id: String!) {
    issue(id: $id) { ${ISSUE_FIELDS} }
  }
`;

export const PROJECT_LIST_FIELDS = `
  id
  name
  slugId
  url
  createdAt
  updatedAt
  status { name }
  labels { nodes { name } }
  teams { nodes { id key } }
`;

export const PROJECT_DETAIL_FIELDS = `
  id
  name
  slugId
  description
  url
  createdAt
  updatedAt
  status { name description color }
  health
  lead { id displayName }
  members { nodes { id } }
  startDate
  targetDate
  progress
  projectMilestones {
    nodes {
      id name description status targetDate progress
    }
  }
  teams { nodes { id key } }
  labels { nodes { name } }
`;

export const FETCH_ALL_PROJECTS = `
  query FetchAllProjects($after: String, $filter: ProjectFilter) {
    projects(first: 50, after: $after, filter: $filter) {
      nodes { ${PROJECT_LIST_FIELDS} }
      pageInfo { hasNextPage endCursor }
    }
  }
`;

export const FETCH_PROJECT_BY_ID = `
  query FetchProjectById($id: String!) {
    project(id: $id) { ${PROJECT_DETAIL_FIELDS} }
  }
`;
